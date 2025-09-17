/**
 * PDF Generation Service
 * Handles PDF generation for quotations and receipts using Puppeteer
 */

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const puppeteerRegular = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const cloudinary = require('../config/cloudinary.config');

class PDFService {
  constructor() {
    this.browser = null;
    this.companyInfo = {
      name:
        process.env.COMPANY_NAME ||
        'Aces Movers and Relocation Company Limited',
      address:
        process.env.COMPANY_ADDRESS ||
        'Kigowa2 Kulambiro Kisaasi Ring Road 83AD, Kampala, Uganda',
      phone: process.env.COMPANY_PHONE || '+256 778 259191',
      phoneSecondary: process.env.COMPANY_PHONE_SECONDARY || '+256 725 711730',
      email: process.env.SUPPORT_EMAIL || 'infor@acesmovers.com',
      website: process.env.COMPANY_WEBSITE || 'acesmovers.com',
      poBox: 'P.O. Box 12345, Kampala', // Keep as placeholder
      tin: 'TIN: 1000123456', // Keep as placeholder
      registration: 'REG: 123456789' // Keep as placeholder
    };
    this.paymentInfo = {
      bankName: process.env.BANK_NAME || 'EQUITY BANK - NTINDA',
      bankAccountName: process.env.BANK_ACCOUNT_NAME || 'KAMOGA GEOFREY',
      bankAccountNumber: process.env.BANK_ACCOUNT_NUMBER || '1044102306223',
      bankSwiftCode: process.env.BANK_SWIFT_CODE || 'EQBLUGKA',
      bankSortCode: process.env.BANK_SORT_CODE || '100137',
      mobileMoneyAccountName:
        process.env.MOBILE_MONEY_ACCOUNT_NAME || 'KAMOGA GEOFREY',
      mobileMoneyMTN: process.env.MOBILE_MONEY_MTN || '0778259191',
      mobileMoneyAirtel: process.env.MOBILE_MONEY_AIRTEL || '0745711730'
    };
  }

  /**
   * Initialize browser instance (singleton)
   */
  async getBrowser() {
    if (!this.browser) {
      const isDev = process.env.NODE_ENV === 'development';
      const isWindows = process.platform === 'win32';

      // Use different configurations for development vs production
      if (isDev && isWindows) {
        // For Windows development, use regular puppeteer with bundled chromium
        this.browser = await puppeteerRegular.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-default-apps'
          ]
        });
      } else {
        // For production/deployment, use chromium
        this.browser = await puppeteer.launch({
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
          ignoreHTTPSErrors: true
        });
      }
    }
    return this.browser;
  }

  /**
   * Close browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Format currency amount
   */
  formatCurrency(amount, currency = 'UGX') {
    const formatter = new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: currency === 'UGX' ? 0 : 2
    });
    return formatter.format(amount);
  }

  /**
   * Format date
   */
  formatDate(date) {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  /**
   * Generate company header HTML
   */
  async generateCompanyHeader() {
    const logoPath = path.join(process.cwd(), 'public', 'img', 'Aces_logo.svg');
    let logoBase64 = '';

    try {
      const logoBuffer = await fs.readFile(logoPath);
      logoBase64 = `data:image/svg+xml;base64,${logoBuffer.toString('base64')}`;
    } catch (error) {
      console.log('Logo file not found, proceeding without logo');
    }

    return `
      <div class="company-header">
        <div class="company-logo">
          ${logoBase64 ? `<img src="${logoBase64}" alt="${this.companyInfo.name}" class="logo-img" />` : `<h1>${this.companyInfo.name}</h1>`}
        </div>
        <div class="company-details">
          <p><strong>${this.companyInfo.address}</strong></p>
          <p>Tel: ${this.companyInfo.phone} / ${this.companyInfo.phoneSecondary}</p>
          <p>Email: ${this.companyInfo.email}</p>
          <p>Website: ${this.companyInfo.website}</p>
        </div>
      </div>
    `;
  }

  /**
   * Generate quotation PDF
   */
  async generateQuotationPDF(quotation) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Populate the createdBy field with signature data (only if it's a Mongoose document)
      if (quotation.populate && typeof quotation.populate === 'function') {
        await quotation.populate(
          'createdBy',
          'fullName phonePrimary address signature'
        );
      }

      const html = await this.generateQuotationHTML(quotation);

      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      return pdf;
    } finally {
      await page.close();
    }
  }

  /**
   * Generate receipt PDF
   */
  async generateReceiptPDF(receipt) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Populate the createdBy field with signature data and payment history receivedBy (only if it's a Mongoose document)
      if (receipt.populate && typeof receipt.populate === 'function') {
        await receipt.populate([
          {
            path: 'createdBy',
            select: 'fullName phonePrimary address signature'
          },
          { path: 'payment.paymentHistory.receivedBy', select: 'fullName' }
        ]);
      }

      const html = await this.generateReceiptHTML(receipt);

      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      return pdf;
    } finally {
      await page.close();
    }
  }

  /**
   * Generate quotation HTML template
   */
  async generateQuotationHTML(quotation) {
    const validUntil = this.formatDate(quotation.validity.validUntil);
    const movingDate = this.formatDate(quotation.locations.movingDate);
    const createdDate = this.formatDate(quotation.createdAt);

    // Generate services table
    const servicesRows = quotation.services
      .map(
        service => `
      <tr>
        <td>${service.name}</td>
        <td>${service.description}</td>
        <td class="text-center">${service.quantity}</td>
        <td class="text-right">${this.formatCurrency(service.unitPrice, quotation.pricing.currency)}</td>
        <td class="text-right">${this.formatCurrency(service.total, quotation.pricing.currency)}</td>
      </tr>
    `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Quotation ${quotation.quotationNumber}</title>
        <style>
          ${this.getCommonStyles()}
        </style>
      </head>
      <body>
        ${await this.generateCompanyHeader()}
        
        <div class="document-title">
          <h2>QUOTATION</h2>
          <p style="text-align: center; font-style: italic; margin-top: 5px; color: #666; font-size: 14px;">
            <strong>This quotation is valid for ${quotation.validity.daysValid} days from the date of issue.</strong>
          </p>
        </div>

        <div class="document-info">
          <div class="info-section">
            <h3>Quotation Details</h3>
            <table class="info-table">
              <tr><td><strong>Quotation No:</strong></td><td>${quotation.quotationNumber}</td></tr>
              <tr><td><strong>Date:</strong></td><td>${createdDate}</td></tr>
              <tr><td><strong>Type:</strong></td><td>${quotation.type.charAt(0).toUpperCase() + quotation.type.slice(1)} Move</td></tr>
              <tr><td><strong>Valid Until:</strong></td><td>${validUntil}</td></tr>
            </table>
          </div>

          <div class="info-section">
            <h3>Client Information</h3>
            <table class="info-table">
              <tr><td><strong>Name:</strong></td><td>${quotation.client.name}</td></tr>
              ${quotation.client.company ? `<tr><td><strong>Company:</strong></td><td>${quotation.client.company}</td></tr>` : ''}
              <tr><td><strong>Phone:</strong></td><td>${quotation.client.phone}</td></tr>
              ${quotation.client.email ? `<tr><td><strong>Email:</strong></td><td>${quotation.client.email}</td></tr>` : ''}
            </table>
          </div>
        </div>

        <div class="info-section">
          <h3>Moving Details</h3>
          <table class="info-table">
            <tr><td><strong>From:</strong></td><td>${quotation.locations.from}</td></tr>
            <tr><td><strong>To:</strong></td><td>${quotation.locations.to}</td></tr>
            <tr><td><strong>Moving Date:</strong></td><td>${movingDate}</td></tr>
          </table>
        </div>

        <div class="services-section">
          <h3>Services</h3>
          <table class="services-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${servicesRows}
            </tbody>
          </table>
        </div>

        <div class="pricing-section">
          <table class="pricing-table">
            <tr>
              <td><strong>Subtotal:</strong></td>
              <td class="text-right">${this.formatCurrency(quotation.pricing.subtotal, quotation.pricing.currency)}</td>
            </tr>
            ${
              quotation.pricing.discount > 0
                ? `
            <tr>
              <td><strong>Discount:</strong></td>
              <td class="text-right">-${this.formatCurrency(quotation.pricing.discount, quotation.pricing.currency)}</td>
            </tr>`
                : ''
            }
            <tr>
              <td><strong>Tax (${(quotation.pricing.taxRate * 100).toFixed(0)}%):</strong></td>
              <td class="text-right">${this.formatCurrency(quotation.pricing.taxAmount, quotation.pricing.currency)}</td>
            </tr>
            <tr class="total-row">
              <td><strong>TOTAL AMOUNT:</strong></td>
              <td class="text-right"><strong>${this.formatCurrency(quotation.pricing.totalAmount, quotation.pricing.currency)}</strong></td>
            </tr>
          </table>
        </div>

        <div class="payment-info-section">
          <h3>Payment Information</h3>
          <div class="payment-methods">
            <div class="payment-method">
              <h4>Bank Transfer</h4>
              <table class="info-table">
                <tr><td><strong>Bank Name:</strong></td><td>${this.paymentInfo.bankName}</td></tr>
                <tr><td><strong>Account Name:</strong></td><td>${this.paymentInfo.bankAccountName}</td></tr>
                <tr><td><strong>Account Number:</strong></td><td>${this.paymentInfo.bankAccountNumber}</td></tr>
                <tr><td><strong>SWIFT Code:</strong></td><td>${this.paymentInfo.bankSwiftCode}</td></tr>
                <tr><td><strong>Sort Code:</strong></td><td>${this.paymentInfo.bankSortCode}</td></tr>
              </table>
            </div>

            <div class="payment-method">
              <h4>Mobile Money</h4>
              <table class="info-table">
                <tr><td><strong>Account Name:</strong></td><td>${this.paymentInfo.mobileMoneyAccountName}</td></tr>
                <tr><td><strong>MTN Number:</strong></td><td>${this.paymentInfo.mobileMoneyMTN}</td></tr>
                <tr><td><strong>Airtel Number:</strong></td><td>${this.paymentInfo.mobileMoneyAirtel}</td></tr>
              </table>
            </div>
          </div>
        </div>

        ${
          quotation.termsAndConditions
            ? `
        <div class="terms-section">
          <h3>Terms & Conditions</h3>
          <p>${quotation.termsAndConditions}</p>
        </div>`
            : ''
        }

        ${
          quotation.notes
            ? `
        <div class="notes-section">
          <h3>Notes</h3>
          <p>${quotation.notes}</p>
        </div>`
            : ''
        }

        <div class="signature-section">
          <div class="signature-block-single">
            <p><strong>Prepared by:</strong> ${quotation.createdBy?.fullName || 'Authorized Representative'}</p>
            <div class="signature-line-container">
              <p><strong>Signature:</strong></p>
              ${
                quotation.createdBy?.signature?.data
                  ? `<div class="signature-image-container">
                  ${
                    quotation.createdBy.signature.type === 'canvas'
                      ? `<img src="${quotation.createdBy.signature.data}" alt="Signature" class="signature-img" />`
                      : `<img src="${quotation.createdBy.signature.data}" alt="Signature" class="signature-img" />`
                  }
                </div>`
                  : '<div class="signature-placeholder">_____________________</div>'
              }
            </div>
            <p><strong>Date:</strong> ${createdDate}</p>
          </div>
        </div>

        <div class="footer">
          <p><em>Thank you for choosing ${this.companyInfo.name}</em></p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate receipt HTML template
   */
  async generateReceiptHTML(receipt) {
    const createdDate = this.formatDate(receipt.createdAt);
    const movingDate = receipt.locations?.movingDate
      ? this.formatDate(receipt.locations.movingDate)
      : null;

    // Generate services table - different format for commitment receipts
    const isCommitmentReceipt = receipt.receiptType === 'commitment';
    const servicesRows = receipt.services
      .map(service => {
        if (isCommitmentReceipt) {
          // Commitment receipt without quantity column
          return `
      <tr>
        <td>${service.description}</td>
        <td class="text-right">${this.formatCurrency(service.amount, receipt.payment.currency)}</td>
        <td class="text-right">${this.formatCurrency(service.total, receipt.payment.currency)}</td>
      </tr>
    `;
        } else {
          // Regular receipt with quantity column
          return `
      <tr>
        <td>${service.description}</td>
        <td class="text-center">${service.quantity || 1}</td>
        <td class="text-right">${this.formatCurrency(service.amount, receipt.payment.currency)}</td>
        <td class="text-right">${this.formatCurrency(service.total, receipt.payment.currency)}</td>
      </tr>
    `;
        }
      })
      .join('');

    // Generate payment history if exists
    const paymentHistoryRows =
      receipt.payment.paymentHistory
        ?.map(
          payment => `
      <tr>
        <td>${this.formatDate(payment.date)}</td>
        <td>${payment.method.replace('_', ' ').toUpperCase()}</td>
        <td class="text-right">${this.formatCurrency(payment.amount, receipt.payment.currency)}</td>
        <td>${payment.receivedBy?.fullName || '-'}</td>
      </tr>
    `
        )
        .join('') || '';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Receipt ${receipt.receiptNumber}</title>
        <style>
          ${this.getCommonStyles()}
        </style>
      </head>
      <body>
        ${await this.generateCompanyHeader()}
        
        <div class="document-title">
          <h2>RECEIPT</h2>
          ${receipt.payment.status === 'paid' ? '<div class="paid-stamp">PAID</div>' : ''}
        </div>

        <div class="document-info">
          <div class="info-section">
            <h3>Receipt Details</h3>
            <table class="info-table">
              <tr><td><strong>Receipt No:</strong></td><td>${receipt.receiptNumber}</td></tr>
              <tr><td><strong>Date:</strong></td><td>${createdDate}</td></tr>
              <tr><td><strong>Type:</strong></td><td>${receipt.receiptType.charAt(0).toUpperCase() + receipt.receiptType.slice(1)} Receipt</td></tr>
              ${receipt.quotationId ? `<tr><td><strong>Quotation Ref:</strong></td><td>${receipt.quotationId.quotationNumber || receipt.quotationId}</td></tr>` : ''}
            </table>
          </div>

          <div class="info-section">
            <h3>Client Information</h3>
            <table class="info-table">
              <tr><td><strong>Name:</strong></td><td>${receipt.client.name}</td></tr>
              <tr><td><strong>Phone:</strong></td><td>${receipt.client.phone}</td></tr>
              ${receipt.client.email ? `<tr><td><strong>Email:</strong></td><td>${receipt.client.email}</td></tr>` : ''}
              ${receipt.client.address ? `<tr><td><strong>Address:</strong></td><td>${receipt.client.address}</td></tr>` : ''}
            </table>
          </div>
        </div>

        ${
          receipt.locations?.from && receipt.locations?.to
            ? `
        <div class="info-section">
          <h3>Service Details</h3>
          <table class="info-table">
            <tr><td><strong>From:</strong></td><td>${receipt.locations.from}</td></tr>
            <tr><td><strong>To:</strong></td><td>${receipt.locations.to}</td></tr>
            ${movingDate ? `<tr><td><strong>Moving Date:</strong></td><td>${movingDate}</td></tr>` : ''}
          </table>
        </div>`
            : ''
        }

        ${
          receipt.receiptType === 'box'
            ? `
        <div class="services-section">
          <h3>Services Provided</h3>
          <table class="services-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Amount</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${servicesRows}
            </tbody>
          </table>
        </div>`
            : ''
        }

        ${
          receipt.receiptType !== 'box'
            ? `
        <div class="payment-section">
          <div class="payment-summary">
            <h3>Payment Summary</h3>
            <table class="services-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${
                  receipt.receiptType === 'commitment'
                    ? `
                <tr>
                  <td><strong>Commitment Fee Paid</strong></td>
                  <td class="text-right">${this.formatCurrency(receipt.commitmentFeePaid || 0, receipt.payment.currency)}</td>
                </tr>
                <tr>
                  <td><strong>Total Amount For Moving</strong></td>
                  <td class="text-right">${this.formatCurrency(receipt.totalMovingAmount || 0, receipt.payment.currency)}</td>
                </tr>
                <tr class="balance-row">
                  <td><strong>Balance Due</strong></td>
                  <td class="text-right"><strong>${this.formatCurrency((receipt.totalMovingAmount || 0) - (receipt.commitmentFeePaid || 0), receipt.payment.currency)}</strong></td>
                </tr>`
                    : receipt.receiptType === 'final'
                      ? `
                <tr>
                  <td><strong>Commitment Fee Paid (Previously)</strong></td>
                  <td class="text-right">${this.formatCurrency(receipt.commitmentFeePaid || 0, receipt.payment.currency)}</td>
                </tr>
                <tr>
                  <td><strong>Final Payment Received</strong></td>
                  <td class="text-right">${this.formatCurrency(receipt.finalPaymentReceived || 0, receipt.payment.currency)}</td>
                </tr>
                <tr class="balance-row">
                  <td><strong>Grand Total</strong></td>
                  <td class="text-right"><strong>${this.formatCurrency((receipt.commitmentFeePaid || 0) + (receipt.finalPaymentReceived || 0), receipt.payment.currency)}</strong></td>
                </tr>`
                      : receipt.receiptType === 'one_time'
                        ? `
                <tr class="balance-row">
                  <td><strong>Total Amount For Moving</strong></td>
                  <td class="text-right"><strong>${this.formatCurrency(receipt.totalMovingAmount || 0, receipt.payment.currency)}</strong></td>
                </tr>`
                        : ''
                }
              </tbody>
            </table>
          </div>
        </div>`
            : receipt.payment.paymentHistory?.length > 0
              ? `
        <div class="payment-section">
          <div class="payment-history">
            <h3>Payment History</h3>
            <table class="services-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Received By</th>
                </tr>
              </thead>
              <tbody>
                ${paymentHistoryRows}
              </tbody>
            </table>
          </div>
        </div>`
              : ''
        }

        ${
          receipt.commitmentFee?.amount
            ? `
        <div class="commitment-section">
          <h3>Commitment Fee Details</h3>
          <table class="info-table">
            <tr><td><strong>Commitment Fee:</strong></td><td>${this.formatCurrency(receipt.commitmentFee.amount, receipt.payment.currency)}</td></tr>
            ${receipt.commitmentFee.paidDate ? `<tr><td><strong>Paid Date:</strong></td><td>${this.formatDate(receipt.commitmentFee.paidDate)}</td></tr>` : ''}
          </table>
        </div>`
            : ''
        }

        <div class="signature-section">
          <div class="signature-block-single">
            <p><strong>Prepared by:</strong> ${receipt.createdBy?.fullName || 'Authorized Representative'}</p>
            <div class="signature-line-container">
              <p><strong>Signature:</strong></p>
              ${
                receipt.createdBy?.signature?.data
                  ? `<div class="signature-image-container">
                  ${
                    receipt.createdBy.signature.type === 'canvas'
                      ? `<img src="${receipt.createdBy.signature.data}" alt="Signature" class="signature-img" />`
                      : `<img src="${receipt.createdBy.signature.data}" alt="Signature" class="signature-img" />`
                  }
                </div>`
                  : '<div class="signature-placeholder">_____________________</div>'
              }
            </div>
            <p><strong>Date:</strong> ${createdDate}</p>
          </div>
        </div>

        <div class="footer">
          <p><em>Thank you for choosing ${this.companyInfo.name}.</em></p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get common CSS styles for PDFs
   */
  getCommonStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Arial', sans-serif;
        font-size: 12px;
        line-height: 1.4;
        color: #333;
      }

      .company-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid #2563eb;
      }

      .company-logo h1 {
        font-size: 24px;
        color: #2563eb;
        font-weight: bold;
      }

      .logo-img {
        height: 60px;
        width: auto;
        max-width: 200px;
      }

      .company-details {
        text-align: right;
        font-size: 10px;
      }

      .company-details p {
        margin-bottom: 2px;
      }

      .document-title {
        text-align: center;
        margin: 20px 0;
        position: relative;
      }

      .document-title h2 {
        font-size: 24px;
        color: #2563eb;
        font-weight: bold;
      }

      .paid-stamp {
        position: absolute;
        top: -10px;
        right: 20px;
        background: #16a34a;
        color: white;
        padding: 5px 15px;
        font-weight: bold;
        border-radius: 5px;
        font-size: 14px;
      }

      .document-info {
        display: flex;
        flex-wrap: wrap;
        margin-bottom: 20px;
        gap: 20px;
      }

      .info-section {
        flex: 1;
        min-width: 250px;
        margin-bottom: 15px;
      }

      .info-section h3 {
        font-size: 14px;
        color: #2563eb;
        margin-bottom: 8px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 3px;
      }

      .info-table {
        width: 100%;
      }

      .info-table td {
        padding: 3px 8px 3px 0;
        vertical-align: top;
      }

      .info-table td:first-child {
        width: 35%;
        font-weight: 500;
      }

      .services-section, .payment-section {
        margin: 20px 0;
      }

      .services-section h3, .payment-section h3 {
        font-size: 14px;
        color: #2563eb;
        margin-bottom: 10px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 3px;
      }

      .services-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
      }

      .services-table th,
      .services-table td {
        border: 1px solid #d1d5db;
        padding: 8px;
        text-align: left;
      }

      .services-table th {
        background-color: #f3f4f6;
        font-weight: bold;
        font-size: 11px;
      }

      .services-table td {
        font-size: 11px;
      }

      .text-center { text-align: center; }
      .text-right { text-align: right; }

      .pricing-section {
        margin: 20px 0;
      }

      .pricing-table {
        width: 50%;
        margin-left: auto;
        border-collapse: collapse;
      }

      .pricing-table td {
        padding: 5px 10px;
        border-bottom: 1px solid #e5e7eb;
      }

      .pricing-table .total-row td,
      .pricing-table .balance-row td {
        border-top: 2px solid #2563eb;
        border-bottom: 2px solid #2563eb;
        font-size: 13px;
      }

      .payment-section {
        display: flex;
        gap: 30px;
        flex-wrap: wrap;
      }

      .payment-summary {
        flex: 1;
        min-width: 300px;
      }

      .payment-history {
        flex: 1;
        min-width: 400px;
      }

      .status-badge {
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: bold;
      }

      .status-paid { background: #dcfce7; color: #166534; }
      .status-partial { background: #fef3c7; color: #92400e; }
      .status-pending { background: #fee2e2; color: #991b1b; }
      .status-overdue { background: #fee2e2; color: #991b1b; }

      .commitment-section {
        margin: 20px 0;
      }

      .commitment-section h3 {
        font-size: 14px;
        color: #2563eb;
        margin-bottom: 8px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 3px;
      }

      .payment-info-section {
        margin: 20px 0;
      }

      .payment-info-section h3 {
        font-size: 14px;
        color: #2563eb;
        margin-bottom: 10px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 3px;
      }

      .payment-methods {
        display: flex;
        gap: 30px;
        flex-wrap: wrap;
      }

      .payment-method {
        flex: 1;
        min-width: 250px;
      }

      .payment-method h4 {
        font-size: 12px;
        color: #333;
        margin-bottom: 5px;
        font-weight: bold;
      }

      .payment-made-section {
        margin: 20px 0;
      }

      .payment-made-section h3 {
        font-size: 14px;
        color: #2563eb;
        margin-bottom: 10px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 3px;
      }

      .payment-made-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
      }

      .payment-made-table th,
      .payment-made-table td {
        border: 1px solid #d1d5db;
        padding: 8px;
        text-align: left;
        font-size: 11px;
      }

      .payment-made-table th {
        background-color: #f3f4f6;
        font-weight: bold;
      }

      .signature-cell {
        text-align: center;
        width: 80px;
      }

      .mini-signature-line {
        border-bottom: 1px solid #333;
        height: 30px;
        margin: 5px 0;
      }

      .signature-section {
        display: flex;
        justify-content: space-between;
        margin: 40px 0 20px 0;
        page-break-inside: avoid;
      }

      .signature-block {
        width: 45%;
        text-align: center;
      }

      .signature-block-single {
        width: 100%;
        margin-top: 30px;
      }

      .signature-block-single p {
        margin: 10px 0;
        font-size: 12px;
        line-height: 1.6;
      }

      .signature-line-container {
        margin: 15px 0;
      }

      .signature-image-container {
        margin: 10px 0;
        padding: 5px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: #fafafa;
        display: inline-block;
        min-width: 200px;
        text-align: center;
      }

      .signature-img {
        max-width: 180px;
        max-height: 60px;
        width: auto;
        height: auto;
      }

      .signature-placeholder {
        display: inline-block;
        border-bottom: 1px solid #333;
        min-width: 200px;
        height: 20px;
        margin-left: 10px;
      }

      .signature-line {
        border-bottom: 1px solid #333;
        height: 40px;
        margin-bottom: 5px;
      }

      .signature-block p {
        margin: 3px 0;
        font-size: 11px;
      }

      .terms-section, .notes-section {
        margin: 20px 0;
        page-break-inside: avoid;
      }

      .terms-section h3, .notes-section h3 {
        font-size: 14px;
        color: #2563eb;
        margin-bottom: 8px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 3px;
      }

      .terms-section p, .notes-section p {
        font-size: 11px;
        text-align: justify;
        line-height: 1.5;
      }

      .footer {
        margin-top: 30px;
        text-align: center;
        font-size: 10px;
        color: #666;
        border-top: 1px solid #e5e7eb;
        padding-top: 10px;
      }

      @media print {
        .paid-stamp {
          -webkit-print-color-adjust: exact;
          color-adjust: exact;
        }
        
        .status-badge {
          -webkit-print-color-adjust: exact;
          color-adjust: exact;
        }
      }
    `;
  }

  /**
   * Upload PDF to Cloudinary
   */
  async uploadPDFToCloudinary(pdfBuffer, fileName, type = 'document') {
    try {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            public_id: `documents/${type}/${fileName}`,
            format: 'pdf',
            flags: 'attachment'
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );
        uploadStream.end(pdfBuffer);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        fileName: fileName
      };
    } catch (error) {
      throw new Error(`Failed to upload PDF to Cloudinary: ${error.message}`);
    }
  }

  /**
   * Generate and upload quotation PDF
   */
  async generateAndUploadQuotationPDF(quotation) {
    const pdfBuffer = await this.generateQuotationPDF(quotation);
    const fileName = `quotation_${quotation.quotationNumber}_${Date.now()}`;

    const uploadResult = await this.uploadPDFToCloudinary(
      pdfBuffer,
      fileName,
      'quotation'
    );

    return {
      pdfBuffer,
      cloudinaryUrl: uploadResult.url,
      publicId: uploadResult.publicId,
      fileName: uploadResult.fileName
    };
  }

  /**
   * Generate and upload receipt PDF
   */
  async generateAndUploadReceiptPDF(receipt) {
    const pdfBuffer = await this.generateReceiptPDF(receipt);
    const fileName = `receipt_${receipt.receiptNumber}_${Date.now()}`;

    const uploadResult = await this.uploadPDFToCloudinary(
      pdfBuffer,
      fileName,
      'receipt'
    );

    return {
      pdfBuffer,
      cloudinaryUrl: uploadResult.url,
      publicId: uploadResult.publicId,
      fileName: uploadResult.fileName
    };
  }
}

module.exports = new PDFService();
