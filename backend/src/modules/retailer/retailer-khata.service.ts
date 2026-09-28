import {
  KhataTransactionType,
  Prisma,
  RecordStatus,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../errors/app-error.js';
import {
  CreateCustomerInput,
  ListCustomersQuery,
  ListKhataTransactionsQuery,
  RecordKhataAdjustmentInput,
  RecordKhataPaymentInput,
  UpdateCustomerInput,
} from './retailer-khata.schemas.js';

export class RetailerKhataService {
  /**
   * Register a new customer for the retailer's store
   */
  async createCustomer(retailerBusinessId: string, input: CreateCustomerInput, actorId?: string) {
    const existing = await prisma.retailerCustomer.findUnique({
      where: {
        retailerBusinessId_phone: {
          retailerBusinessId,
          phone: input.phone,
        },
      },
    });

    if (existing) {
      throw new AppError(
        409,
        'CUSTOMER_PHONE_EXISTS',
        `A customer with phone number ${input.phone} already exists in your store.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const openingBal = new Prisma.Decimal(input.openingBalance || 0);

      const customer = await tx.retailerCustomer.create({
        data: {
          retailerBusinessId,
          name: input.name,
          phone: input.phone,
          ...(input.email ? { email: input.email } : {}),
          ...(input.address ? { address: input.address } : {}),
          ...(input.creditLimit !== undefined && input.creditLimit !== null
            ? { creditLimit: new Prisma.Decimal(input.creditLimit) }
            : {}),
          openingBalance: openingBal,
          currentBalance: openingBal,
          status: RecordStatus.ACTIVE,
        },
      });

      // If initial opening debt/balance was specified, log opening transaction
      if (!openingBal.isZero()) {
        await tx.khataTransaction.create({
          data: {
            retailerBusinessId,
            customerId: customer.id,
            type: KhataTransactionType.OPENING_BALANCE,
            amount: openingBal.abs(),
            balanceAfter: openingBal,
            referenceType: 'OPENING_BALANCE',
            notes: 'Initial opening balance on customer registration',
            createdBy: actorId ?? null,
          },
        });
      }

      await tx.retailerAuditLog.create({
        data: {
          retailerBusinessId,
          actorId: actorId ?? null,
          action: 'CREATE_CUSTOMER',
          entityType: 'CUSTOMER',
          entityId: customer.id,
          after: {
            name: customer.name,
            phone: customer.phone,
            openingBalance: openingBal.toString(),
            currentBalance: customer.currentBalance.toString(),
          },
        },
      });

      return customer;
    });
  }

  /**
   * List customers with multi-faceted search, balance status filters, and store-level Khata KPIs
   */
  async listCustomers(retailerBusinessId: string, query: ListCustomersQuery) {
    const where: Prisma.RetailerCustomerWhereInput = {
      retailerBusinessId,
      status: { not: RecordStatus.ARCHIVED },
    };

    if (query.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
      ];
    }

    if (query.balanceStatus === 'WITH_DEBT') {
      where.currentBalance = { gt: 0 };
    } else if (query.balanceStatus === 'ZERO_BALANCE') {
      where.currentBalance = { equals: 0 };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, customers] = await Promise.all([
      prisma.retailerCustomer.count({ where }),
      prisma.retailerCustomer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [query.sortBy ?? 'updatedAt']: query.sortOrder ?? 'desc' },
        include: {
          _count: {
            select: {
              sales: true,
              khataTransactions: true,
            },
          },
        },
      }),
    ]);

    // Compute store-level Khata KPIs across all active customers
    const allCustomers = await prisma.retailerCustomer.findMany({
      where: {
        retailerBusinessId,
        status: { not: RecordStatus.ARCHIVED },
      },
      select: {
        currentBalance: true,
      },
    });

    let totalReceivables = new Prisma.Decimal(0);
    let customersWithDebt = 0;
    for (const c of allCustomers) {
      if (c.currentBalance.gt(0)) {
        totalReceivables = totalReceivables.add(c.currentBalance);
        customersWithDebt++;
      }
    }

    // Collections today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayCollectionsAgg = await prisma.khataTransaction.aggregate({
      where: {
        retailerBusinessId,
        type: KhataTransactionType.PAYMENT_RECEIVED,
        createdAt: { gte: startOfToday },
      },
      _sum: {
        amount: true,
      },
    });

    const todayCollections = todayCollectionsAgg._sum.amount ?? new Prisma.Decimal(0);

    return {
      customers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalCustomers: allCustomers.length,
        totalReceivables: totalReceivables.toFixed(2),
        customersWithDebt,
        todayCollections: todayCollections.toFixed(2),
      },
    };
  }

  /**
   * Get single customer with detailed lifetime profile and recent transactions
   */
  async getCustomerById(retailerBusinessId: string, customerId: string) {
    const customer = await prisma.retailerCustomer.findFirst({
      where: {
        id: customerId,
        retailerBusinessId,
      },
      include: {
        khataTransactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!customer) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found in your store');
    }

    // Calculate lifetime stats
    const [salesStats, paymentsStats] = await Promise.all([
      prisma.retailSale.aggregate({
        where: {
          retailerBusinessId,
          customerId,
        },
        _count: { id: true },
        _sum: { grandTotal: true },
      }),
      prisma.khataTransaction.aggregate({
        where: {
          retailerBusinessId,
          customerId,
          type: KhataTransactionType.PAYMENT_RECEIVED,
        },
        _sum: { amount: true },
      }),
    ]);

    const creditLimitNum = customer.creditLimit ? Number(customer.creditLimit) : null;
    const currentBalNum = Number(customer.currentBalance);
    let creditUtilizationPercent: number | null = null;
    if (creditLimitNum && creditLimitNum > 0) {
      creditUtilizationPercent = Math.min(100, Math.round((currentBalNum / creditLimitNum) * 100));
    }

    return {
      customer,
      stats: {
        totalSalesCount: salesStats._count.id,
        totalPurchasesAmount: (salesStats._sum.grandTotal ?? new Prisma.Decimal(0)).toFixed(2),
        totalPaymentsReceived: (paymentsStats._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
        currentBalance: customer.currentBalance.toFixed(2),
        creditLimit: creditLimitNum !== null ? creditLimitNum.toFixed(2) : null,
        creditUtilizationPercent,
      },
    };
  }

  /**
   * Update customer basic details or credit limit
   */
  async updateCustomer(
    retailerBusinessId: string,
    customerId: string,
    input: UpdateCustomerInput,
    actorId?: string,
  ) {
    const customer = await prisma.retailerCustomer.findFirst({
      where: { id: customerId, retailerBusinessId },
    });

    if (!customer) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found in your store');
    }

    if (input.phone && input.phone !== customer.phone) {
      const existing = await prisma.retailerCustomer.findUnique({
        where: {
          retailerBusinessId_phone: {
            retailerBusinessId,
            phone: input.phone,
          },
        },
      });
      if (existing) {
        throw new AppError(
          409,
          'CUSTOMER_PHONE_EXISTS',
          `Phone number ${input.phone} is already used by another customer in your store.`,
        );
      }
    }

    const updated = await prisma.retailerCustomer.update({
      where: { id: customerId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.creditLimit !== undefined
          ? { creditLimit: input.creditLimit !== null ? new Prisma.Decimal(input.creditLimit) : null }
          : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });

    await prisma.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'UPDATE_CUSTOMER',
        entityType: 'CUSTOMER',
        entityId: customer.id,
        before: {
          name: customer.name,
          phone: customer.phone,
          creditLimit: customer.creditLimit?.toString() ?? null,
        },
        after: {
          name: updated.name,
          phone: updated.phone,
          creditLimit: updated.creditLimit?.toString() ?? null,
        },
      },
    });

    return updated;
  }

  /**
   * Record a payment collected from a customer towards their Khata balance
   */
  async recordPayment(
    retailerBusinessId: string,
    customerId: string,
    input: RecordKhataPaymentInput,
    actorId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const customer = await tx.retailerCustomer.findFirst({
        where: { id: customerId, retailerBusinessId },
      });

      if (!customer) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found in your store');
      }

      const pAmount = new Prisma.Decimal(input.amount);
      const newBalance = customer.currentBalance.sub(pAmount);

      const updatedCustomer = await tx.retailerCustomer.update({
        where: { id: customerId },
        data: { currentBalance: newBalance },
      });

      const transaction = await tx.khataTransaction.create({
        data: {
          retailerBusinessId,
          customerId,
          type: KhataTransactionType.PAYMENT_RECEIVED,
          amount: pAmount,
          balanceAfter: newBalance,
          referenceType: input.paymentMethod,
          ...(input.reference ? { referenceId: input.reference } : {}),
          notes: input.notes?.trim() || `Payment received via ${input.paymentMethod}`,
          createdBy: actorId ?? null,
        },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      await tx.retailerAuditLog.create({
        data: {
          retailerBusinessId,
          actorId: actorId ?? null,
          action: 'RECORD_KHATA_PAYMENT',
          entityType: 'CUSTOMER',
          entityId: customer.id,
          before: { currentBalance: customer.currentBalance.toString() },
          after: {
            currentBalance: newBalance.toString(),
            paidAmount: pAmount.toString(),
            paymentMethod: input.paymentMethod,
            transactionId: transaction.id,
          },
        },
      });

      return {
        customer: updatedCustomer,
        transaction,
      };
    });
  }

  /**
   * Record a manual adjustment to the customer's Khata balance (DEBIT or CREDIT)
   */
  async recordAdjustment(
    retailerBusinessId: string,
    customerId: string,
    input: RecordKhataAdjustmentInput,
    actorId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const customer = await tx.retailerCustomer.findFirst({
        where: { id: customerId, retailerBusinessId },
      });

      if (!customer) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found in your store');
      }

      const adjAmount = new Prisma.Decimal(input.amount);
      // DEBIT adds to debt (customer owes more); CREDIT reduces debt (waiver/correction)
      const newBalance =
        input.direction === 'DEBIT'
          ? customer.currentBalance.add(adjAmount)
          : customer.currentBalance.sub(adjAmount);

      const updatedCustomer = await tx.retailerCustomer.update({
        where: { id: customerId },
        data: { currentBalance: newBalance },
      });

      const formattedNotes = `${input.direction}: ${input.reason}${
        input.notes ? ` (${input.notes})` : ''
      }`;

      const transaction = await tx.khataTransaction.create({
        data: {
          retailerBusinessId,
          customerId,
          type: KhataTransactionType.ADJUSTMENT,
          amount: adjAmount,
          balanceAfter: newBalance,
          referenceType: 'MANUAL_ADJUSTMENT',
          notes: formattedNotes,
          createdBy: actorId ?? null,
        },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      await tx.retailerAuditLog.create({
        data: {
          retailerBusinessId,
          actorId: actorId ?? null,
          action: 'RECORD_KHATA_ADJUSTMENT',
          entityType: 'CUSTOMER',
          entityId: customer.id,
          before: { currentBalance: customer.currentBalance.toString() },
          after: {
            currentBalance: newBalance.toString(),
            adjustmentAmount: adjAmount.toString(),
            direction: input.direction,
            reason: input.reason,
            transactionId: transaction.id,
          },
        },
      });

      return {
        customer: updatedCustomer,
        transaction,
      };
    });
  }

  /**
   * Get paginated ledger statement transactions for a customer
   */
  async listCustomerTransactions(
    retailerBusinessId: string,
    customerId: string,
    query: ListKhataTransactionsQuery,
  ) {
    const customer = await prisma.retailerCustomer.findFirst({
      where: { id: customerId, retailerBusinessId },
    });

    if (!customer) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found in your store');
    }

    const where: Prisma.KhataTransactionWhereInput = {
      retailerBusinessId,
      customerId,
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
      prisma.khataTransaction.count({ where }),
      prisma.khataTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    return {
      customer,
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

export const retailerKhataService = new RetailerKhataService();
