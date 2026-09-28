import {
  KhataTransactionType,
  Prisma,
  ProductStatus,
  RetailerInventoryTransactionType,
  RetailerPaymentMethod,
  RetailerPaymentStatus,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../errors/app-error.js';
import type {
  CreatePosSaleInput,
  ListSalesQuery,
} from './retailer-pos.schemas.js';

// ==========================================
// INVOICE NUMBER GENERATION
// ==========================================

export async function generateInvoiceNumber(
  tx: Prisma.TransactionClient,
  retailerBusinessId: string,
): Promise<string> {
  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(`${currentYear}-01-01T00:00:00.000Z`);

  const count = await tx.retailSale.count({
    where: {
      retailerBusinessId,
      createdAt: { gte: startOfYear },
    },
  });

  const nextSeq = count + 1;
  const seqStr = String(nextSeq).padStart(4, '0');
  const invoiceNumber = `INV-${currentYear}-${seqStr}`;

  // Verify uniqueness (in case of deletes or concurrent generation)
  const existing = await tx.retailSale.findUnique({
    where: {
      retailerBusinessId_invoiceNumber: {
        retailerBusinessId,
        invoiceNumber,
      },
    },
  });

  if (existing) {
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    return `INV-${currentYear}-${seqStr}-${randomSuffix}`;
  }

  return invoiceNumber;
}

// ==========================================
// FAST PRODUCT LOOKUP (BARCODE / SCANNER)
// ==========================================

export async function lookupProducts(retailerBusinessId: string, query: string) {
  const term = query.trim();
  if (!term) return [];

  // Search by exact barcode first, then SKU, then name prefix/contains
  const products = await prisma.retailerProduct.findMany({
    where: {
      retailerBusinessId,
      status: { not: ProductStatus.ARCHIVED },
      OR: [
        { barcode: term },
        { sku: { equals: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { variants: { some: { barcode: term } } },
        { variants: { some: { sku: { equals: term, mode: 'insensitive' } } } },
      ],
    },
    take: 20,
    include: {
      category: { select: { id: true, name: true } },
      variants: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          title: true,
          sku: true,
          barcode: true,
          costPrice: true,
          sellingPrice: true,
        },
      },
      inventories: {
        select: {
          id: true,
          variantId: true,
          quantityAvailable: true,
          lowStockThreshold: true,
        },
      },
    },
  });

  return products.map((p) => {
    const totalQuantity = p.inventories.reduce((acc, inv) => acc + inv.quantityAvailable, 0);

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      unit: p.unit,
      costPrice: p.costPrice.toString(),
      sellingPrice: p.sellingPrice.toString(),
      mrp: p.mrp ? p.mrp.toString() : null,
      taxRate: p.taxRate.toString(),
      taxType: p.taxType,
      trackInventory: p.trackInventory,
      categoryName: p.category?.name ?? 'General',
      totalQuantity,
      variants: p.variants.map((v) => {
        const vInv = p.inventories.find((inv) => inv.variantId === v.id);
        return {
          id: v.id,
          title: v.title,
          sku: v.sku,
          barcode: v.barcode,
          costPrice: v.costPrice.toString(),
          sellingPrice: v.sellingPrice.toString(),
          quantityAvailable: vInv?.quantityAvailable ?? 0,
        };
      }),
    };
  });
}

// ==========================================
// CREATE POS SALE (ATOMIC INVOICE + INVENTORY)
// ==========================================

export async function createPosSale(
  retailerBusinessId: string,
  input: CreatePosSaleInput,
  actorId?: string,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Resolve Customer if provided
    let resolvedCustomerId: string | null = null;

    if (input.customerId) {
      const customer = await tx.retailerCustomer.findFirst({
        where: { id: input.customerId, retailerBusinessId },
      });
      if (!customer) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Selected customer does not exist in your store');
      }
      resolvedCustomerId = customer.id;
    } else if (input.customerPhone && input.customerPhone.trim()) {
      const phone = input.customerPhone.trim();
      let customer = await tx.retailerCustomer.findUnique({
        where: {
          retailerBusinessId_phone: {
            retailerBusinessId,
            phone,
          },
        },
      });

      if (!customer) {
        customer = await tx.retailerCustomer.create({
          data: {
            retailerBusinessId,
            name: input.customerName?.trim() || 'Walk-in Customer',
            phone,
          },
        });
      }
      resolvedCustomerId = customer.id;
    }

    // 2. Validate and process line items
    let grossSubtotal = new Prisma.Decimal(0);
    let totalLineDiscount = new Prisma.Decimal(0);
    let totalTax = new Prisma.Decimal(0);
    let taxableAmount = new Prisma.Decimal(0);
    let nonTaxableAmount = new Prisma.Decimal(0);

    type ProcessedItem = {
      productId: string;
      variantId: string | null;
      productNameSnapshot: string;
      skuSnapshot: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      costPriceSnapshot: Prisma.Decimal;
      discount: Prisma.Decimal;
      tax: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      inventoryId: string;
      currentStock: number;
      trackInventory: boolean;
    };

    const processedItems: ProcessedItem[] = [];

    for (const itemInput of input.items) {
      const product = await tx.retailerProduct.findFirst({
        where: {
          id: itemInput.productId,
          retailerBusinessId,
          status: { not: ProductStatus.ARCHIVED },
        },
        include: {
          variants: true,
          inventories: {
            where: {
              variantId: itemInput.variantId ?? null,
            },
          },
        },
      });

      if (!product) {
        throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product not found or unavailable in your store`);
      }

      const variant = itemInput.variantId
        ? (product.variants.find((v) => v.id === itemInput.variantId) ?? null)
        : null;
      if (itemInput.variantId && !variant) {
        throw new AppError(404, 'VARIANT_NOT_FOUND', `Product variant not found`);
      }

      const inventory = product.inventories[0];
      const currentStock = inventory ? inventory.quantityAvailable : 0;

      // Check stock sufficiency
      if (product.trackInventory) {
        if (!inventory || currentStock < itemInput.quantity) {
          const itemLabel = variant ? `${product.name} (${variant.title})` : product.name;
          throw new AppError(
            400,
            'INSUFFICIENT_STOCK',
            `Insufficient stock for "${itemLabel}". Available: ${currentStock}, Requested: ${itemInput.quantity}.`,
          );
        }
      }

      const unitPrice = itemInput.unitPrice !== undefined
        ? new Prisma.Decimal(itemInput.unitPrice)
        : (variant ? variant.sellingPrice : product.sellingPrice);

      const costPriceSnapshot = variant ? variant.costPrice : product.costPrice;
      const skuSnapshot = variant ? variant.sku : product.sku;
      const productNameSnapshot = variant ? `${product.name} (${variant.title})` : product.name;

      const lineGross = unitPrice.mul(itemInput.quantity);
      const lineDiscount = new Prisma.Decimal(itemInput.discount || 0);
      const lineTaxableBase = Prisma.Decimal.max(0, lineGross.sub(lineDiscount));

      let lineTax = new Prisma.Decimal(0);
      if (product.taxType === 'TAXABLE' && product.taxRate.gt(0)) {
        lineTax = lineTaxableBase.mul(product.taxRate).div(100);
        taxableAmount = taxableAmount.add(lineTaxableBase);
      } else {
        nonTaxableAmount = nonTaxableAmount.add(lineTaxableBase);
      }

      const lineSubtotal = lineTaxableBase.add(lineTax);

      grossSubtotal = grossSubtotal.add(lineGross);
      totalLineDiscount = totalLineDiscount.add(lineDiscount);
      totalTax = totalTax.add(lineTax);

      processedItems.push({
        productId: product.id,
        variantId: variant ? variant.id : null,
        productNameSnapshot,
        skuSnapshot,
        quantity: itemInput.quantity,
        unitPrice,
        costPriceSnapshot,
        discount: lineDiscount,
        tax: lineTax,
        subtotal: lineSubtotal,
        inventoryId: inventory ? inventory.id : '',
        currentStock,
        trackInventory: product.trackInventory,
      });
    }

    // Overall Bill Math
    const overallBillDiscount = new Prisma.Decimal(input.discount || 0);
    const totalDiscount = totalLineDiscount.add(overallBillDiscount);
    const subtotalAfterDiscount = Prisma.Decimal.max(0, grossSubtotal.sub(totalDiscount));
    const grandTotal = subtotalAfterDiscount.add(totalTax);

    // 3. Process Payments
    let totalPaid = new Prisma.Decimal(0);
    let creditKhataAmount = new Prisma.Decimal(0);

    for (const p of input.payments) {
      const pAmount = new Prisma.Decimal(p.amount);
      totalPaid = totalPaid.add(pAmount);

      if (p.method === RetailerPaymentMethod.CREDIT_KHATA) {
        creditKhataAmount = creditKhataAmount.add(pAmount);
      }
    }

    // If Khata credit payment used, customer is strictly required
    if (creditKhataAmount.gt(0) && !resolvedCustomerId) {
      throw new AppError(
        400,
        'CUSTOMER_REQUIRED_FOR_KHATA',
        'A customer account or phone number is required to make a Credit / Khata sale.',
      );
    }

    let paymentStatus: RetailerPaymentStatus = RetailerPaymentStatus.PAID;
    if (totalPaid.lt(grandTotal)) {
      paymentStatus = RetailerPaymentStatus.PARTIALLY_PAID;
    }

    // 4. Generate Invoice Number
    const invoiceNumber = await generateInvoiceNumber(tx, retailerBusinessId);

    // 5. Create RetailSale
    const sale = await tx.retailSale.create({
      data: {
        retailerBusinessId,
        invoiceNumber,
        customerId: resolvedCustomerId,
        subtotal: grossSubtotal,
        discount: totalDiscount,
        tax: totalTax,
        grandTotal,
        paidAmount: totalPaid,
        paymentStatus,
        ...(input.notes ? { notes: input.notes } : {}),
        createdBy: actorId ?? null,
      },
    });

    // 6. Create Sale Items & Decrement Inventory
    for (const item of processedItems) {
      await tx.retailSaleItem.create({
        data: {
          saleId: sale.id,
          productId: item.productId,
          variantId: item.variantId,
          productNameSnapshot: item.productNameSnapshot,
          skuSnapshot: item.skuSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPriceSnapshot: item.costPriceSnapshot,
          discount: item.discount,
          tax: item.tax,
          subtotal: item.subtotal,
        },
      });

      if (item.trackInventory && item.inventoryId) {
        const newQty = item.currentStock - item.quantity;
        await tx.retailerInventory.update({
          where: { id: item.inventoryId },
          data: { quantityAvailable: newQty },
        });

        await tx.retailerInventoryTransaction.create({
          data: {
            retailerBusinessId,
            inventoryId: item.inventoryId,
            type: RetailerInventoryTransactionType.SALE,
            quantity: item.quantity,
            previousQuantity: item.currentStock,
            newQuantity: newQty,
            referenceType: 'RETAIL_SALE',
            referenceId: sale.id,
            reason: `POS Sale #${invoiceNumber}`,
            performedBy: actorId ?? null,
          },
        });
      }
    }

    // 7. Record Payments
    for (const p of input.payments) {
      await tx.retailSalePayment.create({
        data: {
          saleId: sale.id,
          retailerBusinessId,
          method: p.method,
          amount: new Prisma.Decimal(p.amount),
          ...(p.reference ? { reference: p.reference } : {}),
          recordedBy: actorId ?? null,
        },
      });
    }

    // 8. If Credit / Khata payment was made, update customer balance & log Khata transaction
    if (creditKhataAmount.gt(0) && resolvedCustomerId) {
      const cust = await tx.retailerCustomer.findUniqueOrThrow({
        where: { id: resolvedCustomerId },
      });

      const newBalance = cust.currentBalance.add(creditKhataAmount);

      await tx.retailerCustomer.update({
        where: { id: resolvedCustomerId },
        data: { currentBalance: newBalance },
      });

      await tx.khataTransaction.create({
        data: {
          retailerBusinessId,
          customerId: resolvedCustomerId,
          type: KhataTransactionType.SALE_CREDIT,
          amount: creditKhataAmount,
          balanceAfter: newBalance,
          referenceType: 'RETAIL_SALE',
          referenceId: sale.id,
          notes: `Credit invoice #${invoiceNumber}`,
          createdBy: actorId ?? null,
        },
      });
    }

    // 9. Audit Log
    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'CREATE_SALE',
        entityType: 'SALE',
        entityId: sale.id,
        after: {
          invoiceNumber: sale.invoiceNumber,
          grandTotal: grandTotal.toString(),
          paidAmount: totalPaid.toString(),
          itemCount: processedItems.length,
          paymentStatus,
        },
      },
    });

    // 10. Fetch complete sale with associations for response
    const completeSale = await tx.retailSale.findUniqueOrThrow({
      where: { id: sale.id },
      include: {
        customer: { select: { id: true, name: true, phone: true, currentBalance: true } },
        items: true,
        payments: true,
        creator: { select: { id: true, firstName: true, lastName: true } },
        retailerBusiness: {
          select: {
            businessName: true,
            legalName: true,
            panNumber: true,
            vatNumber: true,
            phone: true,
            addressLine: true,
            municipality: true,
            district: true,
          },
        },
      },
    });

    return {
      ...completeSale,
      subtotal: completeSale.subtotal.toString(),
      discount: completeSale.discount.toString(),
      tax: completeSale.tax.toString(),
      grandTotal: completeSale.grandTotal.toString(),
      paidAmount: completeSale.paidAmount.toString(),
      taxableAmount: taxableAmount.toFixed(2),
      nonTaxableAmount: nonTaxableAmount.toFixed(2),
      items: completeSale.items.map((it) => ({
        ...it,
        unitPrice: it.unitPrice.toString(),
        costPriceSnapshot: it.costPriceSnapshot.toString(),
        discount: it.discount.toString(),
        tax: it.tax.toString(),
        subtotal: it.subtotal.toString(),
      })),
      payments: completeSale.payments.map((pm) => ({
        ...pm,
        amount: pm.amount.toString(),
      })),
    };
  });
}

// ==========================================
// LIST SALES INVOICES
// ==========================================

export async function listSales(retailerBusinessId: string, query: ListSalesQuery) {
  const { search, paymentStatus, customerId, startDate, endDate, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.RetailSaleWhereInput = {
    retailerBusinessId,
  };

  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }

  if (customerId) {
    where.customerId = customerId;
  }

  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { invoiceNumber: { contains: term, mode: 'insensitive' } },
      { customer: { name: { contains: term, mode: 'insensitive' } } },
      { customer: { phone: { contains: term } } },
    ];
  }

  if (startDate || endDate) {
    where.saleDate = {};
    if (startDate) where.saleDate.gte = new Date(startDate);
    if (endDate) where.saleDate.lte = new Date(endDate);
  }

  const [totalItems, sales] = await Promise.all([
    prisma.retailSale.count({ where }),
    prisma.retailSale.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { items: true } },
        payments: { select: { method: true, amount: true } },
      },
    }),
  ]);

  const items = sales.map((s) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    saleDate: s.saleDate,
    customerName: s.customer?.name ?? 'Walk-in Customer',
    customerPhone: s.customer?.phone ?? null,
    subtotal: s.subtotal.toString(),
    discount: s.discount.toString(),
    tax: s.tax.toString(),
    grandTotal: s.grandTotal.toString(),
    paidAmount: s.paidAmount.toString(),
    paymentStatus: s.paymentStatus,
    itemCount: s._count.items,
    payments: s.payments.map((p) => ({
      method: p.method,
      amount: p.amount.toString(),
    })),
    cashierName: s.creator ? `${s.creator.firstName} ${s.creator.lastName}` : 'Staff',
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}

// ==========================================
// GET SALE BY ID (PRINTABLE INVOICE)
// ==========================================

export async function getSaleById(retailerBusinessId: string, saleId: string) {
  const sale = await prisma.retailSale.findFirst({
    where: {
      id: saleId,
      retailerBusinessId,
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, address: true, currentBalance: true } },
      creator: { select: { id: true, firstName: true, lastName: true, email: true } },
      items: {
        include: {
          product: { select: { unit: true, taxType: true, taxRate: true } },
        },
      },
      payments: true,
      retailerBusiness: {
        select: {
          id: true,
          businessName: true,
          legalName: true,
          panNumber: true,
          vatNumber: true,
          phone: true,
          email: true,
          province: true,
          district: true,
          municipality: true,
          ward: true,
          addressLine: true,
        },
      },
    },
  });

  if (!sale) {
    throw new AppError(404, 'SALE_NOT_FOUND', 'Invoice not found or does not belong to your store');
  }

  // Calculate tax breakdown
  let taxableAmount = new Prisma.Decimal(0);
  let nonTaxableAmount = new Prisma.Decimal(0);

  for (const it of sale.items) {
    const lineBase = it.unitPrice.mul(it.quantity).sub(it.discount);
    if (it.tax.gt(0)) {
      taxableAmount = taxableAmount.add(lineBase);
    } else {
      nonTaxableAmount = nonTaxableAmount.add(lineBase);
    }
  }

  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    saleDate: sale.saleDate,
    createdAt: sale.createdAt,
    subtotal: sale.subtotal.toString(),
    discount: sale.discount.toString(),
    tax: sale.tax.toString(),
    grandTotal: sale.grandTotal.toString(),
    paidAmount: sale.paidAmount.toString(),
    paymentStatus: sale.paymentStatus,
    notes: sale.notes,
    taxableAmount: taxableAmount.toFixed(2),
    nonTaxableAmount: nonTaxableAmount.toFixed(2),
    store: sale.retailerBusiness,
    customer: sale.customer ? {
      ...sale.customer,
      currentBalance: sale.customer.currentBalance.toString(),
    } : null,
    creator: sale.creator ? `${sale.creator.firstName} ${sale.creator.lastName}` : 'Staff',
    items: sale.items.map((it) => ({
      id: it.id,
      productName: it.productNameSnapshot,
      sku: it.skuSnapshot,
      quantity: it.quantity,
      unit: it.product?.unit ?? 'PCS',
      unitPrice: it.unitPrice.toString(),
      discount: it.discount.toString(),
      tax: it.tax.toString(),
      subtotal: it.subtotal.toString(),
    })),
    payments: sale.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount.toString(),
      reference: p.reference,
      createdAt: p.createdAt,
    })),
  };
}
