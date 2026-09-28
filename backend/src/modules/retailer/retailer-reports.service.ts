import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import type {
  ProductPerformanceQuery,
  ReportDateRangeQuery,
  ReportPeriod,
} from './retailer-reports.schemas.js';

export function resolveDateRange(
  period: ReportPeriod = 'this_month',
  startDate?: string,
  endDate?: string,
): { from: Date; to: Date } {
  const now = new Date();

  if (period === 'custom' && (startDate || endDate)) {
    const from = startDate ? new Date(startDate) : new Date(0);
    const to = endDate ? new Date(endDate) : new Date();
    // If date string is YYYY-MM-DD, adjust 'to' to end of day
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      to.setUTCHours(23, 59, 59, 999);
    }
    return { from, to };
  }

  const to = new Date(now);

  if (period === 'today') {
    const from = new Date(now);
    from.setUTCHours(0, 0, 0, 0);
    return { from, to };
  }

  if (period === 'yesterday') {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 1);
    from.setUTCHours(0, 0, 0, 0);
    const yesterdayTo = new Date(from);
    yesterdayTo.setUTCHours(23, 59, 59, 999);
    return { from, to: yesterdayTo };
  }

  if (period === 'this_week') {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 7);
    from.setUTCHours(0, 0, 0, 0);
    return { from, to };
  }

  if (period === 'last_month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
    const lastMonthTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
    return { from, to: lastMonthTo };
  }

  // Default: 'this_month'
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  return { from, to };
}

export const retailerReportsService = {
  // 1. FINANCIAL OVERVIEW & REAL-TIME P&L
  async getFinancialOverview(
    retailerBusinessId: string,
    query: ReportDateRangeQuery,
  ) {
    const { from, to } = resolveDateRange(query.period, query.startDate, query.endDate);

    const sales = await prisma.retailSale.findMany({
      where: {
        retailerBusinessId,
        saleDate: {
          gte: from,
          lte: to,
        },
      },
      include: {
        items: true,
        payments: true,
      },
      orderBy: {
        saleDate: 'asc',
      },
    });

    let totalSubtotal = new Prisma.Decimal(0);
    let totalDiscount = new Prisma.Decimal(0);
    let totalTax = new Prisma.Decimal(0);
    let grandTotalRevenue = new Prisma.Decimal(0);
    let totalCOGS = new Prisma.Decimal(0);

    const paymentMap = new Map<string, { count: number; total: Prisma.Decimal }>();
    const trendMap = new Map<string, { revenue: Prisma.Decimal; count: number }>();

    for (const sale of sales) {
      totalSubtotal = totalSubtotal.add(sale.subtotal);
      totalDiscount = totalDiscount.add(sale.discount);
      totalTax = totalTax.add(sale.tax);
      grandTotalRevenue = grandTotalRevenue.add(sale.grandTotal);

      // COGS per sale
      for (const item of sale.items) {
        const itemCost = item.costPriceSnapshot.mul(item.quantity);
        totalCOGS = totalCOGS.add(itemCost);
      }

      // Payments breakdown
      for (const p of sale.payments) {
        const existing = paymentMap.get(p.method) || { count: 0, total: new Prisma.Decimal(0) };
        existing.count += 1;
        existing.total = existing.total.add(p.amount);
        paymentMap.set(p.method, existing);
      }

      // Daily trend
      const dayKey = sale.saleDate.toISOString().slice(0, 10);
      const dayData = trendMap.get(dayKey) || { revenue: new Prisma.Decimal(0), count: 0 };
      dayData.revenue = dayData.revenue.add(sale.grandTotal);
      dayData.count += 1;
      trendMap.set(dayKey, dayData);
    }

    const netSales = totalSubtotal; // Sales after discount before tax
    const grossProfit = netSales.sub(totalCOGS);
    const grossMarginPct = netSales.gt(0)
      ? grossProfit.div(netSales).mul(100).toNumber()
      : 0;

    const totalInvoices = sales.length;
    const averageOrderValue = totalInvoices > 0
      ? grandTotalRevenue.div(totalInvoices).toNumber()
      : 0;

    // Payments summary
    const paymentsBreakdown = Array.from(paymentMap.entries()).map(([method, data]) => ({
      method,
      count: data.count,
      totalAmount: data.total.toString(),
      percentage: grandTotalRevenue.gt(0)
        ? data.total.div(grandTotalRevenue).mul(100).toNumber()
        : 0,
    }));

    // Balance Sheet Snapshots (Khata Receivables & Supplier Payables)
    const [receivablesAgg, payablesAgg] = await Promise.all([
      prisma.retailerCustomer.aggregate({
        where: {
          retailerBusinessId,
          currentBalance: { gt: 0 },
        },
        _sum: { currentBalance: true },
        _count: { id: true },
      }),
      prisma.retailerSupplier.aggregate({
        where: {
          retailerBusinessId,
          currentBalance: { gt: 0 },
        },
        _sum: { currentBalance: true },
        _count: { id: true },
      }),
    ]);

    const dailyTrends = Array.from(trendMap.entries()).map(([date, data]) => ({
      date,
      revenue: data.revenue.toString(),
      invoices: data.count,
    }));

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        label: query.period,
      },
      summary: {
        totalInvoices,
        grossSales: totalSubtotal.add(totalDiscount).toString(),
        totalDiscount: totalDiscount.toString(),
        netSales: netSales.toString(),
        totalTax: totalTax.toString(),
        grandTotalRevenue: grandTotalRevenue.toString(),
        costOfGoodsSold: totalCOGS.toString(),
        grossProfit: grossProfit.toString(),
        grossMarginPercentage: Math.round(grossMarginPct * 100) / 100,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      },
      balanceSnapshot: {
        outstandingKhataReceivables: (receivablesAgg._sum.currentBalance ?? new Prisma.Decimal(0)).toString(),
        debtorCount: receivablesAgg._count.id,
        outstandingSupplierPayables: (payablesAgg._sum.currentBalance ?? new Prisma.Decimal(0)).toString(),
        creditorCount: payablesAgg._count.id,
      },
      paymentsBreakdown,
      dailyTrends,
    };
  },

  // 2. NEPAL IRD-COMPLIANT TAX & VAT REPORT
  async getTaxVatReport(
    retailerBusinessId: string,
    query: ReportDateRangeQuery,
  ) {
    const { from, to } = resolveDateRange(query.period, query.startDate, query.endDate);

    const [business, sales] = await Promise.all([
      prisma.retailerBusiness.findUnique({
        where: { id: retailerBusinessId },
        select: {
          businessName: true,
          legalName: true,
          panNumber: true,
          vatNumber: true,
        },
      }),
      prisma.retailSale.findMany({
        where: {
          retailerBusinessId,
          saleDate: {
            gte: from,
            lte: to,
          },
        },
        include: {
          items: true,
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
        orderBy: {
          saleDate: 'desc',
        },
      }),
    ]);

    let totalTaxableSales = new Prisma.Decimal(0);
    let totalVatCollected = new Prisma.Decimal(0);
    let totalExemptSales = new Prisma.Decimal(0);
    let totalSalesGross = new Prisma.Decimal(0);

    const invoiceRegisters = sales.map((sale) => {
      let saleTaxable = new Prisma.Decimal(0);
      let saleVat = new Prisma.Decimal(0);
      let saleExempt = new Prisma.Decimal(0);

      for (const item of sale.items) {
        if (item.tax.gt(0)) {
          const taxableBase = item.subtotal.sub(item.tax);
          saleTaxable = saleTaxable.add(taxableBase);
          saleVat = saleVat.add(item.tax);
        } else {
          saleExempt = saleExempt.add(item.subtotal);
        }
      }

      totalTaxableSales = totalTaxableSales.add(saleTaxable);
      totalVatCollected = totalVatCollected.add(saleVat);
      totalExemptSales = totalExemptSales.add(saleExempt);
      totalSalesGross = totalSalesGross.add(sale.grandTotal);

      return {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        saleDate: sale.saleDate.toISOString(),
        customerName: sale.customer?.name || 'Walk-in Customer',
        customerPhone: sale.customer?.phone || null,
        taxableAmount: saleTaxable.toString(),
        vatAmount: saleVat.toString(),
        exemptAmount: saleExempt.toString(),
        grandTotal: sale.grandTotal.toString(),
      };
    });

    return {
      business: {
        businessName: business?.businessName || '',
        legalName: business?.legalName || '',
        panNumber: business?.panNumber || null,
        vatNumber: business?.vatNumber || null,
      },
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        label: query.period,
      },
      vatSummary: {
        totalTaxableSales: totalTaxableSales.toString(),
        totalVatCollected: totalVatCollected.toString(),
        totalExemptSales: totalExemptSales.toString(),
        totalSalesGross: totalSalesGross.toString(),
        effectiveVatRate: '13%',
        invoiceCount: sales.length,
      },
      invoiceRegisters,
    };
  },

  // 3. PRODUCT SALES & PROFIT PERFORMANCE
  async getProductPerformance(
    retailerBusinessId: string,
    query: ProductPerformanceQuery,
  ) {
    const { from, to } = resolveDateRange(query.period, query.startDate, query.endDate);

    const saleItems = await prisma.retailSaleItem.findMany({
      where: {
        sale: {
          retailerBusinessId,
          saleDate: {
            gte: from,
            lte: to,
          },
        },
      },
      select: {
        productId: true,
        productNameSnapshot: true,
        skuSnapshot: true,
        quantity: true,
        unitPrice: true,
        costPriceSnapshot: true,
        subtotal: true,
      },
    });

    const productMap = new Map<string, {
      productId: string;
      name: string;
      sku: string;
      unitsSold: number;
      revenue: Prisma.Decimal;
      cost: Prisma.Decimal;
    }>();

    for (const item of saleItems) {
      const existing = productMap.get(item.productId) || {
        productId: item.productId,
        name: item.productNameSnapshot,
        sku: item.skuSnapshot,
        unitsSold: 0,
        revenue: new Prisma.Decimal(0),
        cost: new Prisma.Decimal(0),
      };

      existing.unitsSold += item.quantity;
      existing.revenue = existing.revenue.add(item.subtotal);
      existing.cost = existing.cost.add(item.costPriceSnapshot.mul(item.quantity));
      productMap.set(item.productId, existing);
    }

    const performance = Array.from(productMap.values()).map((p) => {
      const grossProfit = p.revenue.sub(p.cost);
      const marginPct = p.revenue.gt(0)
        ? grossProfit.div(p.revenue).mul(100).toNumber()
        : 0;

      return {
        productId: p.productId,
        name: p.name,
        sku: p.sku,
        unitsSold: p.unitsSold,
        revenue: p.revenue.toString(),
        costOfGoodsSold: p.cost.toString(),
        grossProfit: grossProfit.toString(),
        marginPercentage: Math.round(marginPct * 100) / 100,
      };
    });

    // Sorting
    performance.sort((a, b) => {
      if (query.sortBy === 'units') {
        return b.unitsSold - a.unitsSold;
      }
      if (query.sortBy === 'profit') {
        return Number(b.grossProfit) - Number(a.grossProfit);
      }
      // default: revenue
      return Number(b.revenue) - Number(a.revenue);
    });

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        label: query.period,
      },
      products: performance.slice(0, query.limit),
    };
  },
};
