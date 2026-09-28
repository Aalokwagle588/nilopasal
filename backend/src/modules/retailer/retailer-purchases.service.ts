import {
  Prisma,
  RecordStatus,
  RetailerInventoryTransactionType,
  RetailerPurchaseStatus,
  SupplierTransactionType,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../errors/app-error.js';
import {
  CreatePurchaseInput,
  CreateSupplierInput,
  ListPurchasesQuery,
  ListSuppliersQuery,
  ListSupplierTransactionsQuery,
  RecordSupplierPaymentInput,
  UpdateSupplierInput,
} from './retailer-purchases.schemas.js';

export class RetailerPurchasesService {
  /**
   * Generate sequential store-scoped purchase order number (PO-YYYY-XXXX)
   */
  async generatePurchaseNumber(
    tx: Prisma.TransactionClient,
    retailerBusinessId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const count = await tx.retailerPurchase.count({
      where: {
        retailerBusinessId,
        purchaseNumber: { startsWith: `PO-${year}-` },
      },
    });

    let nextSeq = count + 1;
    let poNum = `PO-${year}-${String(nextSeq).padStart(4, '0')}`;

    while (
      await tx.retailerPurchase.findUnique({
        where: {
          retailerBusinessId_purchaseNumber: {
            retailerBusinessId,
            purchaseNumber: poNum,
          },
        },
      })
    ) {
      nextSeq++;
      poNum = `PO-${year}-${String(nextSeq).padStart(4, '0')}`;
    }

    return poNum;
  }

  /**
   * Register a new supplier
   */
  async createSupplier(
    retailerBusinessId: string,
    input: CreateSupplierInput,
    actorId?: string,
  ) {
    const existing = await prisma.retailerSupplier.findFirst({
      where: {
        retailerBusinessId,
        phone: input.phone,
        status: { not: RecordStatus.ARCHIVED },
      },
    });

    if (existing) {
      throw new AppError(
        409,
        'SUPPLIER_PHONE_EXISTS',
        `A supplier with phone number ${input.phone} already exists in your store.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const openingBal = new Prisma.Decimal(input.openingBalance || 0);

      const supplier = await tx.retailerSupplier.create({
        data: {
          retailerBusinessId,
          name: input.name,
          companyName: input.companyName ?? null,
          phone: input.phone,
          email: input.email ?? null,
          panNumber: input.panNumber ?? null,
          vatNumber: input.vatNumber ?? null,
          address: input.address ?? null,
          openingBalance: openingBal,
          currentBalance: openingBal,
          status: RecordStatus.ACTIVE,
        },
      });

      if (!openingBal.isZero()) {
        await tx.supplierTransaction.create({
          data: {
            retailerBusinessId,
            supplierId: supplier.id,
            type: SupplierTransactionType.OPENING_BALANCE,
            amount: openingBal.abs(),
            balanceAfter: openingBal,
            referenceType: 'OPENING_BALANCE',
            notes: 'Initial opening balance on supplier registration',
            createdBy: actorId ?? null,
          },
        });
      }

      await tx.retailerAuditLog.create({
        data: {
          retailerBusinessId,
          actorId: actorId ?? null,
          action: 'CREATE_SUPPLIER',
          entityType: 'SUPPLIER',
          entityId: supplier.id,
          after: {
            name: supplier.name,
            companyName: supplier.companyName,
            phone: supplier.phone,
            currentBalance: supplier.currentBalance.toString(),
          },
        },
      });

      return supplier;
    });
  }

  /**
   * List suppliers with search, balance filters, and store-level payables KPIs
   */
  async listSuppliers(retailerBusinessId: string, query: ListSuppliersQuery) {
    const where: Prisma.RetailerSupplierWhereInput = {
      retailerBusinessId,
      status: { not: RecordStatus.ARCHIVED },
    };

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { companyName: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
      ];
    }

    if (query.hasBalance === 'DUE') {
      where.currentBalance = { gt: 0 };
    } else if (query.hasBalance === 'SETTLED') {
      where.currentBalance = { equals: 0 };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, suppliers] = await Promise.all([
      prisma.retailerSupplier.count({ where }),
      prisma.retailerSupplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy ?? 'updatedAt']: query.sortOrder ?? 'desc' },
        include: {
          _count: {
            select: {
              purchases: true,
              supplierTransactions: true,
            },
          },
        },
      }),
    ]);

    // Compute store-level accounts payable KPIs
    const allSuppliers = await prisma.retailerSupplier.findMany({
      where: {
        retailerBusinessId,
        status: { not: RecordStatus.ARCHIVED },
      },
      select: { currentBalance: true },
    });

    let totalPayables = new Prisma.Decimal(0);
    let suppliersWithDues = 0;
    for (const sup of allSuppliers) {
      if (sup.currentBalance.gt(0)) {
        totalPayables = totalPayables.add(sup.currentBalance);
        suppliersWithDues++;
      }
    }

    return {
      suppliers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalSuppliers: allSuppliers.length,
        totalPayables: totalPayables.toFixed(2),
        suppliersWithDues,
      },
    };
  }

  /**
   * Get single supplier profile and summary stats
   */
  async getSupplierById(retailerBusinessId: string, supplierId: string) {
    const supplier = await prisma.retailerSupplier.findFirst({
      where: { id: supplierId, retailerBusinessId },
      include: {
        purchases: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        supplierTransactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            creator: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!supplier) {
      throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found in your store');
    }

    const purchasesAgg = await prisma.retailerPurchase.aggregate({
      where: { retailerBusinessId, supplierId },
      _count: { id: true },
      _sum: { totalAmount: true, paidAmount: true },
    });

    return {
      supplier,
      stats: {
        totalPurchasesCount: purchasesAgg._count.id,
        totalPurchasesAmount: (purchasesAgg._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
        totalPaidAmount: (purchasesAgg._sum.paidAmount ?? new Prisma.Decimal(0)).toFixed(2),
        currentBalance: supplier.currentBalance.toFixed(2),
      },
    };
  }

  /**
   * Update supplier details
   */
  async updateSupplier(
    retailerBusinessId: string,
    supplierId: string,
    input: UpdateSupplierInput,
    actorId?: string,
  ) {
    const supplier = await prisma.retailerSupplier.findFirst({
      where: { id: supplierId, retailerBusinessId },
    });

    if (!supplier) {
      throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found in your store');
    }

    const updated = await prisma.retailerSupplier.update({
      where: { id: supplierId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.panNumber !== undefined ? { panNumber: input.panNumber } : {}),
        ...(input.vatNumber !== undefined ? { vatNumber: input.vatNumber } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });

    await prisma.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'UPDATE_SUPPLIER',
        entityType: 'SUPPLIER',
        entityId: supplier.id,
        after: { name: updated.name, phone: updated.phone },
      },
    });

    return updated;
  }

  /**
   * Create Purchase Order with optional immediate Stock Receipt (Atomic Inbound ERP)
   */
  async createPurchase(
    retailerBusinessId: string,
    input: CreatePurchaseInput,
    actorId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify supplier
      const supplier = await tx.retailerSupplier.findFirst({
        where: { id: input.supplierId, retailerBusinessId },
      });
      if (!supplier) {
        throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Selected supplier does not exist in your store');
      }

      // 2. Validate line items
      let grossSubtotal = new Prisma.Decimal(0);
      let lineTaxTotal = new Prisma.Decimal(0);
      let lineDiscountTotal = new Prisma.Decimal(0);

      type PreparedItem = {
        productId: string;
        variantId: string | null;
        quantity: number;
        unitCost: Prisma.Decimal;
        tax: Prisma.Decimal;
        discount: Prisma.Decimal;
        total: Prisma.Decimal;
        productName: string;
      };

      const preparedItems: PreparedItem[] = [];

      for (const itemInput of input.items) {
        const product = await tx.retailerProduct.findFirst({
          where: { id: itemInput.productId, retailerBusinessId },
          include: { variants: true },
        });
        if (!product) {
          throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product ${itemInput.productId} not found`);
        }

        const variant = itemInput.variantId
          ? (product.variants.find((v) => v.id === itemInput.variantId) ?? null)
          : null;
        if (itemInput.variantId && !variant) {
          throw new AppError(404, 'VARIANT_NOT_FOUND', `Product variant not found`);
        }

        const unitCost = new Prisma.Decimal(itemInput.unitCost);
        const lineGross = unitCost.mul(itemInput.quantity);
        const lineTax = new Prisma.Decimal(itemInput.tax || 0);
        const lineDiscount = new Prisma.Decimal(itemInput.discount || 0);
        const lineTotal = lineGross.add(lineTax).sub(lineDiscount);

        grossSubtotal = grossSubtotal.add(lineGross);
        lineTaxTotal = lineTaxTotal.add(lineTax);
        lineDiscountTotal = lineDiscountTotal.add(lineDiscount);

        preparedItems.push({
          productId: product.id,
          variantId: variant ? variant.id : null,
          quantity: itemInput.quantity,
          unitCost,
          tax: lineTax,
          discount: lineDiscount,
          total: lineTotal,
          productName: variant ? `${product.name} (${variant.title})` : product.name,
        });
      }

      const overallDiscount = new Prisma.Decimal(input.discount || 0);
      const overallTax = new Prisma.Decimal(input.tax || 0);
      const grandTotal = Prisma.Decimal.max(
        0,
        grossSubtotal.add(lineTaxTotal).add(overallTax).sub(lineDiscountTotal).sub(overallDiscount),
      );
      const paidAmount = new Prisma.Decimal(input.paidAmount || 0);

      // Generate sequential PO number
      const purchaseNumber = await this.generatePurchaseNumber(tx, retailerBusinessId);
      const isReceived = input.status === 'RECEIVED';

      // 3. Create RetailerPurchase
      const purchase = await tx.retailerPurchase.create({
        data: {
          retailerBusinessId,
          supplierId: input.supplierId,
          purchaseNumber,
          status: isReceived ? RetailerPurchaseStatus.RECEIVED : RetailerPurchaseStatus.ORDERED,
          subtotal: grossSubtotal,
          tax: lineTaxTotal.add(overallTax),
          discount: lineDiscountTotal.add(overallDiscount),
          totalAmount: grandTotal,
          paidAmount,
          notes: input.notes ?? null,
          createdBy: actorId ?? null,
          orderedAt: new Date(),
          ...(isReceived ? { receivedAt: new Date() } : {}),
        },
      });

      // 4. Create Purchase Items & execute Inbound Stock Receipt if status is RECEIVED
      for (const item of preparedItems) {
        await tx.retailerPurchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            tax: item.tax,
            discount: item.discount,
            total: item.total,
            receivedQuantity: isReceived ? item.quantity : 0,
          },
        });

        if (isReceived) {
          // Upsert inventory record
          const existingInv = await tx.retailerInventory.findFirst({
            where: {
              retailerBusinessId,
              productId: item.productId,
              variantId: item.variantId,
            },
          });

          let invId: string;
          let prevQty = 0;
          let newQty = item.quantity;

          if (existingInv) {
            invId = existingInv.id;
            prevQty = existingInv.quantityAvailable;
            newQty = prevQty + item.quantity;
            await tx.retailerInventory.update({
              where: { id: invId },
              data: { quantityAvailable: newQty },
            });
          } else {
            const createdInv = await tx.retailerInventory.create({
              data: {
                retailerBusinessId,
                productId: item.productId,
                variantId: item.variantId,
                quantityAvailable: newQty,
              },
            });
            invId = createdInv.id;
          }

          // Create immutable STOCK_IN transaction
          await tx.retailerInventoryTransaction.create({
            data: {
              retailerBusinessId,
              inventoryId: invId,
              type: RetailerInventoryTransactionType.STOCK_IN,
              quantity: item.quantity,
              previousQuantity: prevQty,
              newQuantity: newQty,
              referenceType: 'RETAILER_PURCHASE',
              referenceId: purchase.id,
              reason: `Inbound purchase order #${purchaseNumber}`,
              performedBy: actorId ?? null,
            },
          });

          // Update catalog cost price if requested
          if (input.updateCostPrice) {
            if (item.variantId) {
              await tx.retailerProductVariant.update({
                where: { id: item.variantId },
                data: { costPrice: item.unitCost },
              });
            } else {
              await tx.retailerProduct.update({
                where: { id: item.productId },
                data: { costPrice: item.unitCost },
              });
            }
          }
        }
      }

      // 5. Update Supplier Balance & Ledger if RECEIVED
      if (isReceived) {
        const unpaid = grandTotal.sub(paidAmount);
        const newBalance = supplier.currentBalance.add(unpaid);

        await tx.retailerSupplier.update({
          where: { id: supplier.id },
          data: { currentBalance: newBalance },
        });

        // Log PURCHASE transaction
        await tx.supplierTransaction.create({
          data: {
            retailerBusinessId,
            supplierId: supplier.id,
            type: SupplierTransactionType.PURCHASE,
            amount: grandTotal,
            balanceAfter: supplier.currentBalance.add(grandTotal),
            referenceType: 'PURCHASE_ORDER',
            referenceId: purchase.id,
            notes: `Purchase order #${purchaseNumber}`,
            createdBy: actorId ?? null,
          },
        });

        // Log upfront PAYMENT transaction if any
        if (paidAmount.gt(0)) {
          await tx.supplierTransaction.create({
            data: {
              retailerBusinessId,
              supplierId: supplier.id,
              type: SupplierTransactionType.PAYMENT,
              amount: paidAmount,
              balanceAfter: newBalance,
              referenceType: 'PURCHASE_PAYMENT',
              referenceId: purchase.id,
              notes: `Upfront payment for PO #${purchaseNumber}`,
              createdBy: actorId ?? null,
            },
          });
        }
      }

      // Audit Log
      await tx.retailerAuditLog.create({
        data: {
          retailerBusinessId,
          actorId: actorId ?? null,
          action: 'CREATE_PURCHASE',
          entityType: 'PURCHASE',
          entityId: purchase.id,
          after: {
            purchaseNumber,
            totalAmount: grandTotal.toString(),
            paidAmount: paidAmount.toString(),
            status: purchase.status,
            itemCount: preparedItems.length,
          },
        },
      });

      return purchase;
    });
  }

  /**
   * Receive goods for an existing DRAFT or ORDERED purchase order
   */
  async receivePurchase(
    retailerBusinessId: string,
    purchaseId: string,
    actorId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const purchase = await tx.retailerPurchase.findFirst({
        where: { id: purchaseId, retailerBusinessId },
        include: { items: true, supplier: true },
      });

      if (!purchase) {
        throw new AppError(404, 'PURCHASE_NOT_FOUND', 'Purchase order not found');
      }

      if (purchase.status === RetailerPurchaseStatus.RECEIVED) {
        throw new AppError(400, 'ALREADY_RECEIVED', 'This purchase order has already been received');
      }

      if (purchase.status === RetailerPurchaseStatus.CANCELLED) {
        throw new AppError(400, 'PURCHASE_CANCELLED', 'Cannot receive a cancelled purchase order');
      }

      // Increment inventory for each item
      for (const item of purchase.items) {
        const existingInv = await tx.retailerInventory.findFirst({
          where: {
            retailerBusinessId,
            productId: item.productId,
            variantId: item.variantId,
          },
        });

        let invId: string;
        let prevQty = 0;
        let newQty = item.quantity;

        if (existingInv) {
          invId = existingInv.id;
          prevQty = existingInv.quantityAvailable;
          newQty = prevQty + item.quantity;
          await tx.retailerInventory.update({
            where: { id: invId },
            data: { quantityAvailable: newQty },
          });
        } else {
          const createdInv = await tx.retailerInventory.create({
            data: {
              retailerBusinessId,
              productId: item.productId,
              variantId: item.variantId,
              quantityAvailable: newQty,
            },
          });
          invId = createdInv.id;
        }

        // Immutable STOCK_IN audit transaction
        await tx.retailerInventoryTransaction.create({
          data: {
            retailerBusinessId,
            inventoryId: invId,
            type: RetailerInventoryTransactionType.STOCK_IN,
            quantity: item.quantity,
            previousQuantity: prevQty,
            newQuantity: newQty,
            referenceType: 'RETAILER_PURCHASE',
            referenceId: purchase.id,
            reason: `Inbound receipt for PO #${purchase.purchaseNumber}`,
            performedBy: actorId ?? null,
          },
        });

        // Mark item as received
        await tx.retailerPurchaseItem.update({
          where: { id: item.id },
          data: { receivedQuantity: item.quantity },
        });
      }

      // Update supplier balance
      const unpaid = purchase.totalAmount.sub(purchase.paidAmount);
      const newBalance = purchase.supplier.currentBalance.add(unpaid);

      await tx.retailerSupplier.update({
        where: { id: purchase.supplierId },
        data: { currentBalance: newBalance },
      });

      // Supplier ledger transactions
      await tx.supplierTransaction.create({
        data: {
          retailerBusinessId,
          supplierId: purchase.supplierId,
          type: SupplierTransactionType.PURCHASE,
          amount: purchase.totalAmount,
          balanceAfter: purchase.supplier.currentBalance.add(purchase.totalAmount),
          referenceType: 'PURCHASE_ORDER',
          referenceId: purchase.id,
          notes: `Purchase order #${purchase.purchaseNumber} received`,
          createdBy: actorId ?? null,
        },
      });

      if (purchase.paidAmount.gt(0)) {
        await tx.supplierTransaction.create({
          data: {
            retailerBusinessId,
            supplierId: purchase.supplierId,
            type: SupplierTransactionType.PAYMENT,
            amount: purchase.paidAmount,
            balanceAfter: newBalance,
            referenceType: 'PURCHASE_PAYMENT',
            referenceId: purchase.id,
            notes: `Upfront payment for PO #${purchase.purchaseNumber}`,
            createdBy: actorId ?? null,
          },
        });
      }

      // Update purchase status
      const updatedPurchase = await tx.retailerPurchase.update({
        where: { id: purchase.id },
        data: {
          status: RetailerPurchaseStatus.RECEIVED,
          receivedAt: new Date(),
        },
      });

      await tx.retailerAuditLog.create({
        data: {
          retailerBusinessId,
          actorId: actorId ?? null,
          action: 'RECEIVE_PURCHASE',
          entityType: 'PURCHASE',
          entityId: purchase.id,
          after: { status: 'RECEIVED', purchaseNumber: purchase.purchaseNumber },
        },
      });

      return updatedPurchase;
    });
  }

  /**
   * List purchase orders
   */
  async listPurchases(retailerBusinessId: string, query: ListPurchasesQuery) {
    const where: Prisma.RetailerPurchaseWhereInput = {
      retailerBusinessId,
    };

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { purchaseNumber: { contains: s, mode: 'insensitive' } },
        { supplier: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, purchases] = await Promise.all([
      prisma.retailerPurchase.count({ where }),
      prisma.retailerPurchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: {
            select: { id: true, name: true, companyName: true, phone: true },
          },
          _count: {
            select: { items: true },
          },
        },
      }),
    ]);

    return {
      purchases,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single purchase order by ID
   */
  async getPurchaseById(retailerBusinessId: string, purchaseId: string) {
    const purchase = await prisma.retailerPurchase.findFirst({
      where: { id: purchaseId, retailerBusinessId },
      include: {
        supplier: true,
        creator: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
            variant: {
              select: { id: true, title: true, sku: true },
            },
          },
        },
      },
    });

    if (!purchase) {
      throw new AppError(404, 'PURCHASE_NOT_FOUND', 'Purchase order not found');
    }

    return purchase;
  }

  /**
   * Record payment made to a supplier
   */
  async recordSupplierPayment(
    retailerBusinessId: string,
    supplierId: string,
    input: RecordSupplierPaymentInput,
    actorId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const supplier = await tx.retailerSupplier.findFirst({
        where: { id: supplierId, retailerBusinessId },
      });

      if (!supplier) {
        throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found in your store');
      }

      const pAmount = new Prisma.Decimal(input.amount);
      const newBalance = supplier.currentBalance.sub(pAmount);

      const updatedSupplier = await tx.retailerSupplier.update({
        where: { id: supplierId },
        data: { currentBalance: newBalance },
      });

      const transaction = await tx.supplierTransaction.create({
        data: {
          retailerBusinessId,
          supplierId,
          type: SupplierTransactionType.PAYMENT,
          amount: pAmount,
          balanceAfter: newBalance,
          referenceType: input.paymentMethod,
          ...(input.reference ? { referenceId: input.reference } : {}),
          notes: input.notes?.trim() || `Payment made via ${input.paymentMethod}`,
          createdBy: actorId ?? null,
        },
        include: {
          creator: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      await tx.retailerAuditLog.create({
        data: {
          retailerBusinessId,
          actorId: actorId ?? null,
          action: 'RECORD_SUPPLIER_PAYMENT',
          entityType: 'SUPPLIER',
          entityId: supplier.id,
          before: { currentBalance: supplier.currentBalance.toString() },
          after: {
            currentBalance: newBalance.toString(),
            paidAmount: pAmount.toString(),
            transactionId: transaction.id,
          },
        },
      });

      return {
        supplier: updatedSupplier,
        transaction,
      };
    });
  }

  /**
   * List supplier transactions ledger
   */
  async listSupplierTransactions(
    retailerBusinessId: string,
    supplierId: string,
    query: ListSupplierTransactionsQuery,
  ) {
    const supplier = await prisma.retailerSupplier.findFirst({
      where: { id: supplierId, retailerBusinessId },
    });

    if (!supplier) {
      throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found in your store');
    }

    const where: Prisma.SupplierTransactionWhereInput = {
      retailerBusinessId,
      supplierId,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const [total, transactions] = await Promise.all([
      prisma.supplierTransaction.count({ where }),
      prisma.supplierTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    return {
      supplier,
      transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const retailerPurchasesService = new RetailerPurchasesService();
