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
    if (currency === 'UGX') {
      // Custom formatting for UGX to show "UGX XXXXX" format
      const number = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
      return `UGX ${number}`;
    } else {
      // Use standard formatting for other currencies
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: currency === 'USD' ? 2 : 0
      });
      return formatter.format(amount);
    }
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
   * Generate company logo for quotation HTML
   */
  async generateCompanyLogoForQuotation() {
    // Try multiple possible paths for the logo
    const possiblePaths = [
      path.join(process.cwd(), 'backend', 'public', 'img', 'Aces_logo.svg'),
      path.join(__dirname, '..', '..', 'public', 'img', 'Aces_logo.svg'),
      path.join(process.cwd(), 'public', 'img', 'Aces_logo.svg')
    ];

    for (const logoPath of possiblePaths) {
      try {
        const logoBuffer = await fs.readFile(logoPath);
        const logoBase64 = `data:image/svg+xml;base64,${logoBuffer.toString('base64')}`;
        console.log(`Logo loaded successfully from: ${logoPath}`);
        return `<div class="company-logo">
          <img src="${logoBase64}" alt="AcesMovers Logo" class="logo-img" />
        </div>`;
      } catch (error) {
        console.log(`Logo not found at: ${logoPath}`);
      }
    }

    console.log(
      'Logo file not found in any expected location, proceeding without logo'
    );
    return '<div class="company-logo"></div>';
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
    const movingDate = quotation.locations?.movingDate
      ? this.formatDate(quotation.locations.movingDate)
      : '';
    const createdDate = this.formatDate(quotation.createdAt);

    // Generate services table rows matching the sample layout
    const servicesRows = quotation.services
      .map(
        (service, index) => `
      <tr class="${index % 2 === 0 ? 'row-white' : 'row-gray'}">
        <td class="service-number">${index + 1}</td>
        <td class="service-name">${service.name}</td>
        <td class="service-description">${service.description}</td>
        <td class="service-amount">${this.formatCurrency(service.total, quotation.pricing.currency)}</td>
      </tr>
    `
      )
      .join('');

    // Format grand total to match sample
    const grandTotal = this.formatCurrency(
      quotation.pricing.totalAmount,
      quotation.pricing.currency
    );

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Quotation ${quotation.quotationNumber}</title>
        <style>
          ${this.getQuotationStyles()}
        </style>
      </head>
      <body>
        <div class="page-container">
          <!-- Header Top Section -->
          <div class="header-top">
            <div class="header-left-top">
              ${await this.generateCompanyLogoForQuotation()}
              <div class="company-name">Aces Movers and Relocation Company Limited</div>
            </div>
            <div class="header-right-top">
              <div class="quotation-title">QUOTATION</div>
            </div>
          </div>

          <!-- Header Bottom Section -->
          <div class="header-bottom">
            <div class="company-info">
              <p>Kigowa2 Kulambiro Kisasi Ring Road 83AD</p>
              <p>Kampala, Uganda.</p>
              <p class="email">info@acesmovers.com</p>
              <p class="phone">+256 778 259191</p>
              <p class="phone">+256 725 711730</p>
              <p class="website">acesmovers.com</p>
            </div>
            <div class="quotation-box">
              <div class="info-row">
                <span class="label">Quotation No:</span>
                <span class="value">${quotation.quotationNumber}</span>
              </div>
              <div class="info-row">
                <span class="label">Date:</span>
                <span class="value">${createdDate}</span>
              </div>
              <div class="info-row">
                <span class="label">Service Type:</span>
                <span class="value">${quotation.type.charAt(0).toUpperCase() + quotation.type.slice(1)} Move</span>
              </div>
            </div>
          </div>

          <!-- Client Info Section -->
          <div class="client-section">
            <div class="section-header">Client's Info</div>
            <div class="client-info">
              ${quotation.client.company ? `<div class="client-row"><span class="client-label">Company Name:</span> <span class="client-value">${quotation.client.company}</span></div>` : ''}
              <div class="client-row"><span class="client-label">Contact Person:</span> <span class="client-value">${quotation.client.name}</span></div>
              <div class="client-row"><span class="client-label">Contact:</span> <span class="client-value">${quotation.client.phone}</span></div>
              <div class="client-row"><span class="client-label">Email:</span> <span class="client-value">${quotation.client.email || ''}</span></div>
              ${quotation.client.gender ? `<div class="client-row"><span class="client-label">Gender:</span> <span class="client-value">${quotation.client.gender.charAt(0).toUpperCase() + quotation.client.gender.slice(1)}</span></div>` : ''}
              <div class="client-row"><span class="client-label">From:</span> <span class="client-value">${quotation.locations.from}</span></div>
              <div class="client-row"><span class="client-label">To:</span> <span class="client-value">${quotation.locations.to}</span></div>
              ${movingDate ? `<div class="client-row"><span class="client-label">Moving Date:</span> <span class="client-value">${movingDate}</span></div>` : ''}
            </div>
          </div>

          <!-- Services Section -->
          <div class="services-section">
            <table class="services-table">
              <thead>
                <tr>
                  <th class="col-number"></th>
                  <th class="col-service">Services</th>
                  <th class="col-description">Description</th>
                  <th class="col-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${servicesRows}
              </tbody>
            </table>
            <div class="total-row">
              <span class="total-label">Grand Total</span>
              <span class="total-amount">${grandTotal}</span>
            </div>
          </div>

          <!-- Payment Details Section -->
          <div class="payment-section">
            <div class="bank-section">
              <div class="payment-header mobile-header">Bank Details</div>
              <div class="payment-row"><span class="pay-label">Account Number:</span> <span>${this.paymentInfo.bankAccountNumber}</span></div>
              <div class="payment-row"><span class="pay-label">Account Name:</span> <span>${this.paymentInfo.bankAccountName}</span></div>
              <div class="payment-row"><span class="pay-label">Bank Name:</span> <span>${this.paymentInfo.bankName}</span></div>
              <div class="payment-row"><span class="pay-label">Swift Code:</span> <span>${this.paymentInfo.bankSwiftCode}</span></div>
              <div class="payment-row"><span class="pay-label">Sort Code:</span> <span>${this.paymentInfo.bankSortCode}</span></div>
            </div>
            <div class="mobile-section">
              <div class="payment-header mobile-header">MOBILE MONEY</div>
              <div class="payment-row">KAMOGA GEOFREY</div>
              <div class="payment-row">${this.paymentInfo.mobileMoneyMTN}</div>
              <div class="payment-row">${this.paymentInfo.mobileMoneyAirtel}</div>
            </div>
          </div>

          <!-- Note Section -->
          ${
            quotation.notes
              ? `
          <div class="note-section">
            <div class="note-header">NOTE:</div>
            <div class="note-text">${quotation.notes}</div>
          </div>`
              : ''
          }

          <!-- Footer Section -->
          <div class="footer-section">
            <div class="footer-message">Thank you for the support. We look forward to working with you in the future.</div>
          </div>
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

    // Get the last payment from payment history to get receivedBy info
    const lastPayment =
      receipt.payment.paymentHistory?.[
        receipt.payment.paymentHistory.length - 1
      ];
    const receivedBy = lastPayment?.receivedBy?.fullName || 'Kamoga Geofrey';
    const paymentMode =
      lastPayment?.method?.replace('_', ' ') || 'Mobile Money';

    // Format currency for receipt amounts
    const formatUGX = amount => {
      return this.formatCurrency(amount, receipt.payment.currency || 'UGX');
    };

    // Generate signature HTML
    const signatureHTML = receipt.createdBy?.signature?.data
      ? `<img src="${receipt.createdBy.signature.data}" alt="Signature" style="max-width: 100px; max-height: 40px;" />`
      : '<div style="width: 100px; height: 40px; background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==); background-size: contain; background-repeat: no-repeat;"></div>';

    // For item receipts, use the new template format
    if (receipt.receiptType === 'item') {
      return await this.generateItemReceiptHTML(receipt);
    }

    // For commitment receipts, use the new template format
    if (receipt.receiptType === 'commitment') {
      return await this.generateCommitmentReceiptHTML(receipt);
    }

    // For final receipts, use the final receipt template format
    if (receipt.receiptType === 'final') {
      return await this.generateFinalReceiptHTML(receipt);
    }

    // For one-time receipts, use the one-time receipt template format
    if (receipt.receiptType === 'one_time') {
      return await this.generateOneTimeReceiptHTML(receipt);
    }

    // For other receipt types, use the existing format
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
              ${receipt.client.gender ? `<tr><td><strong>Gender:</strong></td><td>${receipt.client.gender.charAt(0).toUpperCase() + receipt.client.gender.slice(1)}</td></tr>` : ''}
              ${receipt.receiptType !== 'item' && receipt.moveType ? `<tr><td><strong>Move Type:</strong></td><td>${receipt.moveType.charAt(0).toUpperCase() + receipt.moveType.slice(1)} Move</td></tr>` : ''}
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

          <!-- Payment/Services Table Section -->
          <div class="payment-table-section">
            <table class="payment-table">
              <thead>
                <tr>
                  <th class="description-col">Description</th>
                  <th class="amount-col">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${
                  receipt.receiptType === 'commitment'
                    ? `
                <tr>
                  <td>Commitment Fee Paid:</td>
                  <td class="amount-cell commitment-paid">${formatUGX(receipt.commitmentFeePaid || 0)}</td>
                </tr>
                <tr>
                  <td>Total Amount For Moving:</td>
                  <td class="amount-cell">${formatUGX(receipt.totalMovingAmount || 0)}</td>
                </tr>
                <tr>
                  <td>Balance Due:</td>
                  <td class="amount-cell">${formatUGX((receipt.totalMovingAmount || 0) - (receipt.commitmentFeePaid || 0))}</td>
                </tr>`
                    : ''
                }
              </tbody>
            </table>
          </div>

          <!-- Footer Section -->
          <div class="footer-info">
            <div class="payment-info">
              <div class="payment-row"><span class="payment-label">Payment Mode:</span> <span class="payment-value">${paymentMode}</span></div>
              <div class="payment-row"><span class="payment-label">Received By:</span> <span class="payment-value">${receivedBy}</span></div>
              <div class="payment-row"><span class="payment-label">Signature:</span> <span class="payment-value">${signatureHTML}</span></div>
            </div>
          </div>

          <!-- Thank You Message -->
          <div class="thank-you">
            Thank you for the support. We look forward to working with you in the future.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate item receipt HTML template matching the PDF format
   */
  async generateItemReceiptHTML(receipt) {
    const createdDate = this.formatDate(receipt.createdAt);

    // Get the last payment from payment history to get receivedBy info
    const lastPayment =
      receipt.payment.paymentHistory?.[
        receipt.payment.paymentHistory.length - 1
      ];
    const receivedBy = lastPayment?.receivedBy?.fullName || 'Kamoga Geofrey';
    const paymentMode =
      lastPayment?.method
        ?.replace('_', ' ')
        ?.replace(/mobile_money/i, 'Mobile Money')
        ?.replace(/mobile money/i, 'Mobile Money') || 'Mobile Money';

    // Generate signature HTML
    const signatureHTML = receipt.createdBy?.signature?.data
      ? `<img src="${receipt.createdBy.signature.data}" alt="Signature" style="max-width: 80px; max-height: 30px;" />`
      : '';

    // Try multiple possible paths for the logo
    const possiblePaths = [
      path.join(process.cwd(), 'backend', 'public', 'img', 'Aces_logo.svg'),
      path.join(__dirname, '..', '..', 'public', 'img', 'Aces_logo.svg'),
      path.join(process.cwd(), 'public', 'img', 'Aces_logo.svg')
    ];

    let logoBase64 = '';
    for (const logoPath of possiblePaths) {
      try {
        const logoBuffer = await fs.readFile(logoPath);
        logoBase64 = `data:image/svg+xml;base64,${logoBuffer.toString('base64')}`;
        break;
      } catch (error) {
        // Continue trying other paths
      }
    }

    // Format services for display
    const services = receipt.services || [];
    const servicesHTML = services
      .map(service => {
        const amount = service.total || service.amount || 0;
        const formatted = this.formatCurrency(
          amount,
          receipt.payment.currency || 'UGX'
        );
        return `
        <tr>
          <td class="service-description">${service.description || service.name || 'Service'}</td>
          <td class="service-amount">${formatted}</td>
        </tr>
      `;
      })
      .join('');

    // Calculate total
    const totalAmount =
      receipt.payment.totalAmount ||
      services.reduce(
        (sum, service) => sum + (service.total || service.amount || 0),
        0
      );
    const formattedTotal = this.formatCurrency(
      totalAmount,
      receipt.payment.currency || 'UGX'
    );

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Receipt ${receipt.receiptNumber}</title>
        <style>
          ${this.getItemReceiptStyles()}
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <!-- Header Section -->
          <div class="header-section">
            <div class="header-left">
              ${logoBase64 ? `<img src="${logoBase64}" alt="AcesMovers" class="logo" />` : ''}
            </div>
            <div class="header-right">
              <h1 class="receipt-title">RECEIPT</h1>
            </div>
          </div>

          <!-- Company Info -->
          <div class="company-info">
            <div class="company-name">Aces Movers and Relocation Company Limited</div>
            <div class="company-address">
              <p>Kigowa2 Kulambiro Kisaasi Ring Road 83AD</p>
              <p>Kampala, Uganda.</p>
            </div>
            <div class="company-contact">
              <p class="email">infor@acesmovers.com</p>
              <p class="phone">+256 778 259191</p>
              <p class="phone">+256 725 711730</p>
              <p class="website">acesmovers.com</p>
            </div>
          </div>

          <!-- Receipt Info Box -->
          <div class="receipt-info-box">
            <div class="info-row">
              <span class="info-label">Receipt No:</span>
              <span class="info-value">${receipt.receiptNumber}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Date:</span>
              <span class="info-value">${createdDate}</span>
            </div>
          </div>

          <!-- Client Info Section -->
          <div class="client-section">
            <div class="client-row">
              <span class="client-label">Clients Name:</span>
              <span class="client-value">${receipt.client.name}</span>
            </div>
            <div class="client-row">
              <span class="client-label">Phone Number:</span>
              <span class="client-value">${receipt.client.phone}</span>
            </div>
            ${receipt.client.gender ? `<div class="client-row">
              <span class="client-label">Gender:</span>
              <span class="client-value">${receipt.client.gender.charAt(0).toUpperCase() + receipt.client.gender.slice(1)}</span>
            </div>` : ''}
            <div class="client-row">
              <span class="client-label">Address:</span>
              <span class="client-value">${receipt.client.address || ''}</span>
            </div>
          </div>

          <!-- Services Table -->
          <div class="services-section">
            <table class="services-table">
              <thead>
                <tr>
                  <th class="col-description">Description</th>
                  <th class="col-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${servicesHTML}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td class="total-label">Total:</td>
                  <td class="total-amount">${formattedTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Payment Info Section -->
          <div class="payment-section">
            <div class="payment-row">
              <span class="payment-label">Payment Mode:</span>
              <span class="payment-value">${paymentMode}</span>
            </div>
            <div class="payment-row">
              <span class="payment-label">Received By:</span>
              <span class="payment-value">${receivedBy}</span>
            </div>
            <div class="payment-row">
              <span class="payment-label">Signature:</span>
              <span class="payment-value signature-value">${signatureHTML}</span>
            </div>
          </div>

          <!-- Thank You Message -->
          <div class="thank-you-message">
            Thank you for the support. We look forward to working with you in the future.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate final receipt HTML template matching the PDF format
   */
  async generateFinalReceiptHTML(receipt) {
    const createdDate = this.formatDate(receipt.createdAt);
    const movingDate = receipt.locations?.movingDate
      ? this.formatDate(receipt.locations.movingDate)
      : this.formatDate(receipt.movingDate) || '';

    // Get the last payment from payment history to get receivedBy info
    const lastPayment =
      receipt.payment.paymentHistory?.[
        receipt.payment.paymentHistory.length - 1
      ];
    const receivedBy = lastPayment?.receivedBy?.fullName || 'Kamoga Geofrey';
    const paymentMode =
      lastPayment?.method
        ?.replace('_', ' ')
        ?.replace(/mobile_money/i, 'Mobile Money')
        ?.replace(/mobile money/i, 'Mobile Money') || 'Mobile Money';

    // Generate signature HTML
    const signatureHTML = receipt.createdBy?.signature?.data
      ? `<img src="${receipt.createdBy.signature.data}" alt="Signature" style="max-width: 80px; max-height: 30px;" />`
      : '';

    // Try multiple possible paths for the logo
    const possiblePaths = [
      path.join(process.cwd(), 'backend', 'public', 'img', 'Aces_logo.svg'),
      path.join(__dirname, '..', '..', 'public', 'img', 'Aces_logo.svg'),
      path.join(process.cwd(), 'public', 'img', 'Aces_logo.svg')
    ];

    let logoBase64 = '';
    for (const logoPath of possiblePaths) {
      try {
        const logoBuffer = await fs.readFile(logoPath);
        logoBase64 = `data:image/svg+xml;base64,${logoBuffer.toString('base64')}`;
        break;
      } catch (error) {
        // Continue trying other paths
      }
    }

    // Format amounts
    const commitmentFeePaid = this.formatCurrency(
      receipt.commitmentFeePaid || 0,
      receipt.payment.currency || 'UGX'
    );
    const finalPaymentReceived = this.formatCurrency(
      receipt.finalPaymentReceived || 0,
      receipt.payment.currency || 'UGX'
    );
    const grandTotal = this.formatCurrency(
      (receipt.commitmentFeePaid || 0) + (receipt.finalPaymentReceived || 0),
      receipt.payment.currency || 'UGX'
    );

    // Get service type (residential, commercial, etc.)
    const serviceType = receipt.moveType
      ? `${receipt.moveType.charAt(0).toUpperCase() + receipt.moveType.slice(1)} Move`
      : 'Residential Move';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Receipt ${receipt.receiptNumber}</title>
        <style>
          ${this.getFinalReceiptStyles()}
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <!-- Header Section -->
          <div class="header-section">
            <div class="header-left">
              ${logoBase64 ? `<img src="${logoBase64}" alt="AcesMovers" class="logo" />` : ''}
            </div>
            <div class="header-right">
              <h1 class="receipt-title">RECEIPT</h1>
            </div>
          </div>

          <!-- Company Info -->
          <div class="company-info">
            <div class="company-name">Aces Movers and Relocation Company Limited</div>
            <div class="company-address">
              <p>Kigowa2 Kulambiro Kisaasi Ring Road 83AD</p>
              <p>Kampala, Uganda.</p>
            </div>
            <div class="company-contact">
              <p class="email">infor@acesmovers.com</p>
              <p class="phone">+256 778 259191</p>
              <p class="phone">+256 725 711730</p>
              <p class="website">acesmovers.com</p>
            </div>
          </div>

          <!-- Receipt Info Box -->
          <div class="receipt-info-box">
            <div class="info-row">
              <span class="info-label">Receipt No:</span>
              <span class="info-value">${receipt.receiptNumber}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Date:</span>
              <span class="info-value">${createdDate}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Service Type:</span>
              <span class="info-value">${serviceType}</span>
            </div>
          </div>

          <!-- Client Info Section -->
          <div class="client-section">
            <div class="client-row">
              <span class="client-label">Clients Name:</span>
              <span class="client-value">${receipt.client.name}</span>
            </div>
            <div class="client-row">
              <span class="client-label">Phone Number:</span>
              <span class="client-value">${receipt.client.phone}</span>
            </div>
            ${receipt.client.gender ? `<div class="client-row">
              <span class="client-label">Gender:</span>
              <span class="client-value">${receipt.client.gender.charAt(0).toUpperCase() + receipt.client.gender.slice(1)}</span>
            </div>` : ''}
            <div class="client-row">
              <span class="client-label">Pickup Location:</span>
              <span class="client-value">${receipt.locations?.from || ''}</span>
            </div>
            <div class="client-row">
              <span class="client-label">Destination:</span>
              <span class="client-value">${receipt.locations?.to || ''}</span>
            </div>
            ${
              movingDate
                ? `<div class="client-row">
              <span class="client-label">Moving Date:</span>
              <span class="client-value">${movingDate}</span>
            </div>`
                : ''
            }
          </div>

          <!-- Payment Table -->
          <div class="payment-table-section">
            <table class="payment-table">
              <thead>
                <tr>
                  <th class="col-description">Description</th>
                  <th class="col-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="payment-description">Commitment Fee Paid (Previously):</td>
                  <td class="payment-amount">${commitmentFeePaid}</td>
                </tr>
                <tr class="alt-row">
                  <td class="payment-description">Final Payment Received:</td>
                  <td class="payment-amount final-payment">${finalPaymentReceived}</td>
                </tr>
                <tr>
                  <td class="payment-description">Grand Total:</td>
                  <td class="payment-amount grand-total">${grandTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Payment Info Section -->
          <div class="payment-section">
            <div class="payment-row">
              <span class="payment-label">Payment Mode:</span>
              <span class="payment-value">${paymentMode}</span>
            </div>
            <div class="payment-row">
              <span class="payment-label">Received By:</span>
              <span class="payment-value">${receivedBy}</span>
            </div>
            <div class="payment-row">
              <span class="payment-label">Signature:</span>
              <span class="payment-value signature-value">${signatureHTML}</span>
            </div>
          </div>

          <!-- Thank You Message -->
          <div class="thank-you-message">
            Thank you for the support. We look forward to working with you in the future.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate one-time receipt HTML template matching the PDF format
   */
  async generateOneTimeReceiptHTML(receipt) {
    const createdDate = this.formatDate(receipt.createdAt);

    // Get the last payment from payment history to get receivedBy info
    const lastPayment =
      receipt.payment.paymentHistory?.[
        receipt.payment.paymentHistory.length - 1
      ];
    const receivedBy = lastPayment?.receivedBy?.fullName || 'Kamoga Geofrey';
    const paymentMode =
      lastPayment?.method
        ?.replace('_', ' ')
        ?.replace(/mobile_money/i, 'Mobile Money')
        ?.replace(/mobile money/i, 'Mobile Money') || 'Mobile Money';

    // Generate signature HTML
    const signatureHTML = receipt.createdBy?.signature?.data
      ? `<img src="${receipt.createdBy.signature.data}" alt="Signature" style="max-width: 80px; max-height: 30px;" />`
      : '';

    // Try multiple possible paths for the logo
    const possiblePaths = [
      path.join(process.cwd(), 'backend', 'public', 'img', 'Aces_logo.svg'),
      path.join(__dirname, '..', '..', 'public', 'img', 'Aces_logo.svg'),
      path.join(process.cwd(), 'public', 'img', 'Aces_logo.svg')
    ];

    let logoBase64 = '';
    for (const logoPath of possiblePaths) {
      try {
        const logoBuffer = await fs.readFile(logoPath);
        logoBase64 = `data:image/svg+xml;base64,${logoBuffer.toString('base64')}`;
        break;
      } catch (error) {
        // Continue trying other paths
      }
    }

    // Format amounts
    const totalCostForMoving = this.formatCurrency(
      receipt.totalMovingAmount || 0,
      receipt.payment.currency || 'UGX'
    );

    // Get service type (residential, commercial, etc.)
    const serviceType = receipt.moveType
      ? `${receipt.moveType.charAt(0).toUpperCase() + receipt.moveType.slice(1)} Move`
      : 'Residential Move';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Receipt ${receipt.receiptNumber}</title>
        <style>
          ${this.getOneTimeReceiptStyles()}
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <!-- Header Section -->
          <div class="header-section">
            <div class="header-left">
              ${logoBase64 ? `<img src="${logoBase64}" alt="AcesMovers" class="logo" />` : ''}
            </div>
            <div class="header-right">
              <h1 class="receipt-title">RECEIPT</h1>
            </div>
          </div>

          <!-- Company Info -->
          <div class="company-info">
            <div class="company-name">Aces Movers and Relocation Company Limited</div>
            <div class="company-address">
              <p>Kigowa2 Kulambiro Kisaasi Ring Road 83AD</p>
              <p>Kampala, Uganda.</p>
            </div>
            <div class="company-contact">
              <p class="email">infor@acesmovers.com</p>
              <p class="phone">+256 778 259191</p>
              <p class="phone">+256 725 711730</p>
              <p class="website">acesmovers.com</p>
            </div>
          </div>

          <!-- Receipt Info Box -->
          <div class="receipt-info-box">
            <div class="info-row">
              <span class="info-label">Receipt No:</span>
              <span class="info-value">${receipt.receiptNumber}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Date:</span>
              <span class="info-value">${createdDate}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Service Type:</span>
              <span class="info-value">${serviceType}</span>
            </div>
          </div>

          <!-- Client Info Section -->
          <div class="client-section">
            <div class="client-row">
              <span class="client-label">Clients Name:</span>
              <span class="client-value">${receipt.client.name}</span>
            </div>
            <div class="client-row">
              <span class="client-label">Phone Number:</span>
              <span class="client-value">${receipt.client.phone}</span>
            </div>
            ${receipt.client.gender ? `<div class="client-row">
              <span class="client-label">Gender:</span>
              <span class="client-value">${receipt.client.gender.charAt(0).toUpperCase() + receipt.client.gender.slice(1)}</span>
            </div>` : ''}
            <div class="client-row">
              <span class="client-label">Pickup Location:</span>
              <span class="client-value">${receipt.locations?.from || ''}</span>
            </div>
            <div class="client-row">
              <span class="client-label">Destination:</span>
              <span class="client-value">${receipt.locations?.to || ''}</span>
            </div>
          </div>

          <!-- Payment Table -->
          <div class="payment-table-section">
            <table class="payment-table">
              <thead>
                <tr>
                  <th class="col-description">Description</th>
                  <th class="col-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="payment-description">Total Cost For Moving:</td>
                  <td class="payment-amount">${totalCostForMoving}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Payment Info Section -->
          <div class="payment-section">
            <div class="payment-row">
              <span class="payment-label">Payment Mode:</span>
              <span class="payment-value">${paymentMode}</span>
            </div>
            <div class="payment-row">
              <span class="payment-label">Received By:</span>
              <span class="payment-value">${receivedBy}</span>
            </div>
            <div class="payment-row">
              <span class="payment-label">Signature:</span>
              <span class="payment-value signature-value">${signatureHTML}</span>
            </div>
          </div>

          <!-- Thank You Message -->
          <div class="thank-you-message">
            Thank you for the support. We look forward to working with you in the future.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate commitment receipt HTML template matching the PDF format
   */
  async generateCommitmentReceiptHTML(receipt) {
    const createdDate = this.formatDate(receipt.createdAt);
    const movingDate = receipt.locations?.movingDate
      ? this.formatDate(receipt.locations.movingDate)
      : this.formatDate(receipt.movingDate) || '';

    // Get the last payment from payment history to get receivedBy info
    const lastPayment =
      receipt.payment.paymentHistory?.[
        receipt.payment.paymentHistory.length - 1
      ];
    const receivedBy = lastPayment?.receivedBy?.fullName || 'Kamoga Geofrey';
    const paymentMode =
      lastPayment?.method
        ?.replace('_', ' ')
        ?.replace(/mobile_money/i, 'Mobile Money')
        ?.replace(/mobile money/i, 'Mobile Money') || 'Mobile Money';

    // Generate signature HTML
    const signatureHTML = receipt.createdBy?.signature?.data
      ? `<img src="${receipt.createdBy.signature.data}" alt="Signature" style="max-width: 80px; max-height: 30px;" />`
      : '';

    // Try multiple possible paths for the logo
    const possiblePaths = [
      path.join(process.cwd(), 'backend', 'public', 'img', 'Aces_logo.svg'),
      path.join(__dirname, '..', '..', 'public', 'img', 'Aces_logo.svg'),
      path.join(process.cwd(), 'public', 'img', 'Aces_logo.svg')
    ];

    let logoBase64 = '';
    for (const logoPath of possiblePaths) {
      try {
        const logoBuffer = await fs.readFile(logoPath);
        logoBase64 = `data:image/svg+xml;base64,${logoBuffer.toString('base64')}`;
        break;
      } catch (error) {
        // Continue trying other paths
      }
    }

    // Format amounts
    const commitmentFeePaid = this.formatCurrency(
      receipt.commitmentFeePaid || 0,
      receipt.payment.currency || 'UGX'
    );
    const totalMovingAmount = this.formatCurrency(
      receipt.totalMovingAmount || 0,
      receipt.payment.currency || 'UGX'
    );
    const balanceDue = this.formatCurrency(
      (receipt.totalMovingAmount || 0) - (receipt.commitmentFeePaid || 0),
      receipt.payment.currency || 'UGX'
    );

    // Get service type (residential, commercial, etc.)
    const serviceType = receipt.moveType
      ? `${receipt.moveType.charAt(0).toUpperCase() + receipt.moveType.slice(1)} Move`
      : 'Residential Move';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Receipt ${receipt.receiptNumber}</title>
        <style>
          ${this.getCommitmentReceiptStyles()}
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <!-- Header Section -->
          <div class="header-section">
            <div class="header-left">
              ${logoBase64 ? `<img src="${logoBase64}" alt="AcesMovers" class="logo" />` : ''}
            </div>
            <div class="header-right">
              <h1 class="receipt-title">RECEIPT</h1>
            </div>
          </div>

          <!-- Company Info -->
          <div class="company-info">
            <div class="company-name">Aces Movers and Relocation Company Limited</div>
            <div class="company-address">
              <p>Kigowa2 Kulambiro Kisaasi Ring Road 83AD</p>
              <p>Kampala, Uganda.</p>
            </div>
            <div class="company-contact">
              <p class="email">infor@acesmovers.com</p>
              <p class="phone">+256 778 259191</p>
              <p class="phone">+256 725 711730</p>
              <p class="website">acesmovers.com</p>
            </div>
          </div>

          <!-- Receipt Info Box -->
          <div class="receipt-info-box">
            <div class="info-row">
              <span class="info-label">Receipt No:</span>
              <span class="info-value">${receipt.receiptNumber}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Date:</span>
              <span class="info-value">${createdDate}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Service Type:</span>
              <span class="info-value">${serviceType}</span>
            </div>
          </div>

          <!-- Client Info Section -->
          <div class="client-section">
            <div class="client-row">
              <span class="client-label">Clients Name:</span>
              <span class="client-value">${receipt.client.name}</span>
            </div>
            <div class="client-row">
              <span class="client-label">Phone Number:</span>
              <span class="client-value">${receipt.client.phone}</span>
            </div>
            ${receipt.client.gender ? `<div class="client-row">
              <span class="client-label">Gender:</span>
              <span class="client-value">${receipt.client.gender.charAt(0).toUpperCase() + receipt.client.gender.slice(1)}</span>
            </div>` : ''}
            <div class="client-row">
              <span class="client-label">Pickup Location:</span>
              <span class="client-value">${receipt.locations?.from || ''}</span>
            </div>
            <div class="client-row">
              <span class="client-label">Destination:</span>
              <span class="client-value">${receipt.locations?.to || ''}</span>
            </div>
            ${
              movingDate
                ? `<div class="client-row">
              <span class="client-label">Moving Date:</span>
              <span class="client-value">${movingDate}</span>
            </div>`
                : ''
            }
          </div>

          <!-- Payment Table -->
          <div class="payment-table-section">
            <table class="payment-table">
              <thead>
                <tr>
                  <th class="col-description">Description</th>
                  <th class="col-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="payment-description">Commitment Fee Paid:</td>
                  <td class="payment-amount commitment-paid">${commitmentFeePaid}</td>
                </tr>
                <tr class="alt-row">
                  <td class="payment-description">Total Amount For Moving:</td>
                  <td class="payment-amount">${totalMovingAmount}</td>
                </tr>
                <tr>
                  <td class="payment-description">Balance Due:</td>
                  <td class="payment-amount">${balanceDue}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Payment Info Section -->
          <div class="payment-section">
            <div class="payment-row">
              <span class="payment-label">Payment Mode:</span>
              <span class="payment-value">${paymentMode}</span>
            </div>
            <div class="payment-row">
              <span class="payment-label">Received By:</span>
              <span class="payment-value">${receivedBy}</span>
            </div>
            <div class="payment-row">
              <span class="payment-label">Signature:</span>
              <span class="payment-value signature-value">${signatureHTML}</span>
            </div>
          </div>

          <!-- Thank You Message -->
          <div class="thank-you-message">
            Thank you for the support. We look forward to working with you in the future.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get one-time receipt-specific CSS styles matching the PDF design
   */
  getOneTimeReceiptStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: Arial, sans-serif;
        font-size: 11px;
        line-height: 1.4;
        color: #000;
        background: white;
      }

      .receipt-container {
        width: 100%;
        max-width: 210mm;
        margin: 0 auto;
        padding: 15mm 20mm;
      }

      /* Header Section */
      .header-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
      }

      .header-left {
        flex: 1;
      }

      .logo {
        height: 50px;
        width: auto;
        margin-bottom: 2px;
      }

      .receipt-title {
        font-size: 24px;
        font-weight: bold;
        color: #1e40af;
        letter-spacing: 1px;
      }

      /* Company Info */
      .company-info {
        margin-bottom: 15px;
      }

      .company-name {
        font-size: 12px;
        color: #22C55E;
        font-weight: 600;
        margin-bottom: 5px;
      }

      .company-address,
      .company-contact {
        font-size: 10px;
        color: #333;
        line-height: 1.3;
      }

      .company-address p,
      .company-contact p {
        margin: 1px 0;
      }

      .company-contact .email {
        color: #2563eb;
      }

      .company-contact .website {
        color: #2563eb;
      }

      /* Receipt Info Box */
      .receipt-info-box {
        border: 1.5px solid #6b7280;
        padding: 10px 15px;
        display: inline-block;
        float: right;
        margin-bottom: 20px;
        margin-top: -75px;
        background: white;
        min-width: 200px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 3px;
        font-size: 10px;
        gap: 15px;
      }

      .info-row:last-child {
        margin-bottom: 0;
      }

      .info-label {
        font-weight: normal;
        white-space: nowrap;
      }

      .info-value {
        font-weight: normal;
        text-align: right;
      }

      /* Client Section */
      .client-section {
        clear: both;
        margin: 30px 0 20px 0;
        padding-top: 10px;
        border-top: 1px solid #e5e7eb;
      }

      .client-row {
        display: flex;
        margin-bottom: 6px;
        font-size: 10px;
      }

      .client-label {
        min-width: 130px;
        font-weight: normal;
      }

      .client-value {
        flex: 1;
      }

      /* Payment Table Section */
      .payment-table-section {
        margin: 25px 0;
      }

      .payment-table {
        width: 100%;
        border-collapse: collapse;
      }

      .payment-table thead tr {
        background-color: #6b7280;
      }

      .payment-table th {
        color: white;
        padding: 8px 12px;
        text-align: left;
        font-size: 11px;
        font-weight: normal;
      }

      .col-description {
        width: auto;
      }

      .col-amount {
        width: 150px;
        text-align: left;
      }

      .payment-table tbody td {
        padding: 12px;
        font-size: 11px;
        background: white;
      }

      .payment-description {
        color: #111;
      }

      .payment-amount {
        text-align: left;
        font-weight: normal;
        color: #000;
      }

      /* Payment Info Section */
      .payment-section {
        margin: 30px 0;
        padding-top: 20px;
        border-top: 1px solid #e5e7eb;
      }

      .payment-row {
        display: flex;
        margin-bottom: 8px;
        font-size: 10px;
        align-items: center;
      }

      .payment-label {
        min-width: 120px;
        font-weight: normal;
      }

      .payment-value {
        flex: 1;
      }

      .signature-value {
        display: flex;
        align-items: center;
      }

      /* Thank You Message */
      .thank-you-message {
        text-align: left;
        margin-top: 50px;
        padding-top: 20px;
        font-size: 11px;
        color: #22C55E;
        font-style: normal;
      }

      @page {
        size: A4;
        margin: 0;
      }

      @media print {
        body {
          margin: 0;
        }
        .receipt-container {
          max-width: 100%;
          padding: 15mm;
        }
      }
    `;
  }

  /**
   * Get final receipt-specific CSS styles matching the PDF design
   */
  getFinalReceiptStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: Arial, sans-serif;
        font-size: 11px;
        line-height: 1.4;
        color: #000;
        background: white;
      }

      .receipt-container {
        width: 100%;
        max-width: 210mm;
        margin: 0 auto;
        padding: 15mm 20mm;
      }

      /* Header Section */
      .header-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
      }

      .header-left {
        flex: 1;
      }

      .logo {
        height: 50px;
        width: auto;
        margin-bottom: 2px;
      }

      .receipt-title {
        font-size: 24px;
        font-weight: bold;
        color: #1e40af;
        letter-spacing: 1px;
      }

      /* Company Info */
      .company-info {
        margin-bottom: 15px;
      }

      .company-name {
        font-size: 12px;
        color: #22C55E;
        font-weight: 600;
        margin-bottom: 5px;
      }

      .company-address,
      .company-contact {
        font-size: 10px;
        color: #333;
        line-height: 1.3;
      }

      .company-address p,
      .company-contact p {
        margin: 1px 0;
      }

      .company-contact .email {
        color: #2563eb;
      }

      .company-contact .website {
        color: #2563eb;
      }

      /* Receipt Info Box */
      .receipt-info-box {
        border: 1.5px solid #6b7280;
        padding: 10px 15px;
        display: inline-block;
        float: right;
        margin-bottom: 20px;
        margin-top: -75px;
        background: white;
        min-width: 200px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 3px;
        font-size: 10px;
        gap: 15px;
      }

      .info-row:last-child {
        margin-bottom: 0;
      }

      .info-label {
        font-weight: normal;
        white-space: nowrap;
      }

      .info-value {
        font-weight: normal;
        text-align: right;
      }

      /* Client Section */
      .client-section {
        clear: both;
        margin: 30px 0 20px 0;
        padding-top: 10px;
        border-top: 1px solid #e5e7eb;
      }

      .client-row {
        display: flex;
        margin-bottom: 6px;
        font-size: 10px;
      }

      .client-label {
        min-width: 130px;
        font-weight: normal;
      }

      .client-value {
        flex: 1;
      }

      /* Payment Table Section */
      .payment-table-section {
        margin: 25px 0;
      }

      .payment-table {
        width: 100%;
        border-collapse: collapse;
      }

      .payment-table thead tr {
        background-color: #6b7280;
      }

      .payment-table th {
        color: white;
        padding: 8px 12px;
        text-align: left;
        font-size: 11px;
        font-weight: normal;
      }

      .col-description {
        width: auto;
      }

      .col-amount {
        width: 150px;
        text-align: left;
      }

      .payment-table tbody td {
        padding: 12px;
        font-size: 11px;
        background: white;
      }

      .payment-table tbody tr.alt-row td {
        background: #f9fafb;
      }

      .payment-description {
        color: #111;
      }

      .payment-amount {
        text-align: left;
        font-weight: normal;
      }

      .final-payment {
        color: #000;
        font-weight: normal;
        font-size: 11px;
      }

      .grand-total {
        color: #000;
        font-weight: normal;
        font-size: 11px;
      }

      /* Payment Info Section */
      .payment-section {
        margin: 30px 0;
        padding-top: 20px;
        border-top: 1px solid #e5e7eb;
      }

      .payment-row {
        display: flex;
        margin-bottom: 8px;
        font-size: 10px;
        align-items: center;
      }

      .payment-label {
        min-width: 120px;
        font-weight: normal;
      }

      .payment-value {
        flex: 1;
      }

      .signature-value {
        display: flex;
        align-items: center;
      }

      /* Thank You Message */
      .thank-you-message {
        text-align: left;
        margin-top: 50px;
        padding-top: 20px;
        font-size: 11px;
        color: #22C55E;
        font-style: normal;
      }

      @page {
        size: A4;
        margin: 0;
      }

      @media print {
        body {
          margin: 0;
        }
        .receipt-container {
          max-width: 100%;
          padding: 15mm;
        }
      }
    `;
  }

  /**
   * Get commitment receipt-specific CSS styles matching the PDF design
   */
  getCommitmentReceiptStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: Arial, sans-serif;
        font-size: 11px;
        line-height: 1.4;
        color: #000;
        background: white;
      }

      .receipt-container {
        width: 100%;
        max-width: 210mm;
        margin: 0 auto;
        padding: 15mm 20mm;
      }

      /* Header Section */
      .header-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
      }

      .header-left {
        flex: 1;
      }

      .logo {
        height: 50px;
        width: auto;
        margin-bottom: 2px;
      }

      .tagline {
        font-size: 9px;
        color: #666;
        margin-left: 2px;
      }

      .receipt-title {
        font-size: 24px;
        font-weight: bold;
        color: #1e40af;
        letter-spacing: 1px;
      }

      /* Company Info */
      .company-info {
        margin-bottom: 15px;
      }

      .company-name {
        font-size: 12px;
        color: #22C55E;
        font-weight: 600;
        margin-bottom: 5px;
      }

      .company-address,
      .company-contact {
        font-size: 10px;
        color: #333;
        line-height: 1.3;
      }

      .company-address p,
      .company-contact p {
        margin: 1px 0;
      }

      .company-contact .email {
        color: #2563eb;
      }

      .company-contact .website {
        color: #2563eb;
      }

      /* Receipt Info Box */
      .receipt-info-box {
        border: 1.5px solid #6b7280;
        padding: 10px 15px;
        display: inline-block;
        float: right;
        margin-bottom: 20px;
        margin-top: -75px;
        background: white;
        min-width: 200px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 3px;
        font-size: 10px;
        gap: 15px;
      }

      .info-row:last-child {
        margin-bottom: 0;
      }

      .info-label {
        font-weight: normal;
        white-space: nowrap;
      }

      .info-value {
        font-weight: normal;
        text-align: right;
      }

      /* Client Section */
      .client-section {
        clear: both;
        margin: 30px 0 20px 0;
        padding-top: 10px;
        border-top: 1px solid #e5e7eb;
      }

      .client-row {
        display: flex;
        margin-bottom: 6px;
        font-size: 10px;
      }

      .client-label {
        min-width: 130px;
        font-weight: normal;
      }

      .client-value {
        flex: 1;
      }

      /* Payment Table Section */
      .payment-table-section {
        margin: 25px 0;
      }

      .payment-table {
        width: 100%;
        border-collapse: collapse;
      }

      .payment-table thead tr {
        background-color: #6b7280;
      }

      .payment-table th {
        color: white;
        padding: 8px 12px;
        text-align: left;
        font-size: 11px;
        font-weight: normal;
      }

      .col-description {
        width: auto;
      }

      .col-amount {
        width: 150px;
        text-align: left;
      }

      .payment-table tbody td {
        padding: 12px;
        font-size: 11px;
        background: white;
      }

      .payment-table tbody tr.alt-row td {
        background: #f9fafb;
      }

      .payment-description {
        color: #111;
      }

      .payment-amount {
        text-align: left;
        font-weight: normal;
      }

      .commitment-paid {
        color: #22C55E;
        font-weight: bold;
        font-size: 12px;
      }

      /* Payment Info Section */
      .payment-section {
        margin: 30px 0;
        padding-top: 20px;
        border-top: 1px solid #e5e7eb;
      }

      .payment-row {
        display: flex;
        margin-bottom: 8px;
        font-size: 10px;
        align-items: center;
      }

      .payment-label {
        min-width: 120px;
        font-weight: normal;
      }

      .payment-value {
        flex: 1;
      }

      .signature-value {
        display: flex;
        align-items: center;
      }

      /* Thank You Message */
      .thank-you-message {
        text-align: left;
        margin-top: 50px;
        padding-top: 20px;
        font-size: 11px;
        color: #22C55E;
        font-style: normal;
      }

      @page {
        size: A4;
        margin: 0;
      }

      @media print {
        body {
          margin: 0;
        }
        .receipt-container {
          max-width: 100%;
          padding: 15mm;
        }
      }
    `;
  }

  /**
   * Get item receipt-specific CSS styles matching the PDF design
   */
  getItemReceiptStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: Arial, sans-serif;
        font-size: 11px;
        line-height: 1.4;
        color: #000;
        background: white;
      }

      .receipt-container {
        width: 100%;
        max-width: 210mm;
        margin: 0 auto;
        padding: 15mm 20mm;
      }

      /* Header Section */
      .header-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
      }

      .header-left {
        flex: 1;
      }

      .logo {
        height: 50px;
        width: auto;
        margin-bottom: 2px;
      }

      .tagline {
        font-size: 9px;
        color: #666;
        margin-left: 2px;
      }

      .receipt-title {
        font-size: 24px;
        font-weight: bold;
        color: #1e40af;
        letter-spacing: 1px;
      }

      /* Company Info */
      .company-info {
        margin-bottom: 15px;
      }

      .company-name {
        font-size: 12px;
        color: #22C55E;
        font-weight: 600;
        margin-bottom: 5px;
      }

      .company-address,
      .company-contact {
        font-size: 10px;
        color: #333;
        line-height: 1.3;
      }

      .company-address p,
      .company-contact p {
        margin: 1px 0;
      }

      .company-contact .email {
        color: #2563eb;
      }

      .company-contact .website {
        color: #2563eb;
      }

      /* Receipt Info Box */
      .receipt-info-box {
        border: 1.5px solid #6b7280;
        padding: 15px 15px;
        display: inline-block;
        float: right;
        margin-bottom: 20px;
        margin-top: -90px;
        background: white;
        min-height: 90px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 3px;
        font-size: 10px;
        gap: 20px;
      }

      .info-row:last-child {
        margin-bottom: 0;
      }

      .info-label {
        font-weight: normal;
      }

      .info-value {
        font-weight: normal;
      }

      /* Client Section */
      .client-section {
        clear: both;
        margin: 30px 0 20px 0;
        padding-top: 10px;
      }

      .client-row {
        display: flex;
        margin-bottom: 6px;
        font-size: 10px;
      }

      .client-label {
        min-width: 120px;
        font-weight: normal;
      }

      .client-value {
        flex: 1;
      }

      /* Services Section */
      .services-section {
        margin: 25px 0;
      }

      .services-table {
        width: 100%;
        border-collapse: collapse;
      }

      .services-table thead tr {
        background-color: #6b7280;
      }

      .services-table th {
        color: white;
        padding: 8px 12px;
        text-align: left;
        font-size: 11px;
        font-weight: normal;
      }

      .col-description {
        width: auto;
      }

      .col-amount {
        width: 150px;
        text-align: left;
      }

      .services-table tbody td {
        padding: 10px 12px;
        font-size: 10px;
        background: white;
      }

      .services-table tbody tr:nth-child(even) td {
        background: #f9fafb;
      }

      .service-description {
        color: #111;
      }

      .service-amount {
        text-align: left;
        font-weight: normal;
      }

      .total-row td {
        padding: 12px;
        font-weight: bold;
        font-size: 14px;
        background: white !important;
      }

      .total-label {
        text-align: left;
      }

      .total-amount {
        text-align: left;
        color: #1e40af;
        font-size: 16px;
      }

      /* Payment Section */
      .payment-section {
        margin: 30px 0;
      }

      .payment-row {
        display: flex;
        margin-bottom: 8px;
        font-size: 10px;
        align-items: center;
      }

      .payment-label {
        min-width: 120px;
        font-weight: normal;
      }

      .payment-value {
        flex: 1;
      }

      .signature-value {
        display: flex;
        align-items: center;
      }

      /* Thank You Message */
      .thank-you-message {
        text-align: left;
        margin-top: 50px;
        padding-top: 20px;
        font-size: 11px;
        color: #22C55E;
        font-style: normal;
      }

      @page {
        size: A4;
        margin: 0;
      }

      @media print {
        body {
          margin: 0;
        }
        .receipt-container {
          max-width: 100%;
          padding: 15mm;
        }
      }
    `;
  }

  /**
   * Get quotation-specific CSS styles matching the sample design
   */
  getQuotationStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: Arial, sans-serif;
        font-size: 10px;
        line-height: 1.4;
        color: #000;
        background: white;
      }

      .page-container {
        width: 100%;
        max-width: 210mm;
        margin: 0 auto;
        padding: 15mm 20mm;
      }

      /* Header Top Section */
      .header-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 15px;
      }

      .header-left-top {
        flex: 1;
      }

      .company-logo {
        margin-bottom: 5px;
      }

      .company-logo .logo-img {
        height: 45px;
        width: auto;
      }

      .company-name {
        font-size: 11px;
        color: #22C55E;  /* Green matching the logo */
        margin-bottom: 15px;
        font-weight: 600;
      }

      .quotation-title {
        font-size: 20px;
        font-weight: bold;
        color: #1e40af;
        letter-spacing: 1px;
      }

      /* Header Bottom Section */
      .header-bottom {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid #e5e7eb;
      }

      .company-info {
        font-size: 9px;
        color: #333;
        line-height: 1.3;
      }

      .company-info p {
        margin: 1px 0;
      }

      .company-info .email {
        color: #2563eb;
      }

      .company-info .website {
        color: #2563eb;
      }

      .quotation-box {
        border: 1.5px solid #6b7280;
        padding: 10px 15px;
        min-width: 180px;
        background: white;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 3px;
        font-size: 9px;
        gap: 15px;
      }

      .info-row .label {
        font-weight: normal;
        white-space: nowrap;
      }

      .info-row .value {
        font-weight: normal;
        text-align: right;
      }

      /* Client Section */
      .client-section {
        margin: 20px 0;
      }

      .section-header {
        font-size: 11px;
        font-weight: normal;
        color: #111;
        margin-bottom: 8px;
        padding-bottom: 3px;
        border-bottom: 1px solid #e5e7eb;
      }

      .client-info {
        font-size: 9px;
      }

      .client-row {
        margin-bottom: 4px;
        display: flex;
      }

      .client-label {
        font-weight: normal;
        min-width: 100px;
        margin-right: 15px;
      }

      .client-value {
        flex: 1;
      }

      /* Services Section */
      .services-section {
        margin: 25px 0;
      }

      .services-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 0;
      }

      .services-table thead tr {
        background-color: #6b7280;
      }

      .services-table th {
        color: white;
        padding: 8px;
        text-align: left;
        font-size: 10px;
        font-weight: normal;
      }

      .col-number {
        width: 25px;
        text-align: center;
      }

      .col-service {
        width: 100px;
      }

      .col-description {
        width: auto;
      }

      .col-amount {
        width: 110px;
        text-align: right;
        padding-right: 15px;
      }

      .services-table tbody td {
        padding: 10px 8px;
        vertical-align: top;
        font-size: 9px;
      }

      .row-white {
        background-color: white;
      }

      .row-gray {
        background-color: #f9fafb;
      }

      .service-number {
        text-align: center;
      }

      .service-name {
        font-weight: normal;
      }

      .service-description {
        line-height: 1.4;
        font-size: 8px;
        color: #374151;
      }

      .service-amount {
        text-align: left;
        padding-left: 15px;
      }

      .total-row {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 50px;
        padding: 12px 15px 12px 0;
        border-bottom: 2px solid #e5e7eb;
        margin-top: -1px;
      }

      .total-label {
        font-size: 11px;
        font-weight: normal;
      }

      .total-amount {
        font-size: 16px;
        font-weight: bold;
        color: #22C55E;  /* Green matching logo */
      }

      /* Payment Section */
      .payment-section {
        display: flex;
        gap: 80px;
        margin: 25px 0;
        padding: 15px 0;
      }

      .bank-section,
      .mobile-section {
        flex: 1;
      }

      .mobile-header {
        font-size: 10px;
        font-weight: 600;
        color: #22C55E;  /* Green for Bank Details and MOBILE MONEY */
        margin-bottom: 8px;
      }

      .payment-row {
        font-size: 9px;
        margin-bottom: 3px;
        line-height: 1.3;
      }

      .pay-label {
        font-weight: normal;
        margin-right: 5px;
      }

      /* Note Section */
      .note-section {
        margin: 25px 0;
        padding: 10px 0;
      }

      .note-header {
        font-size: 11px;
        font-weight: bold;
        color: #FF8C00;  /* Orange color for NOTE */
        margin-bottom: 5px;
      }

      .note-text {
        font-size: 9px;
        color: #333;
        line-height: 1.4;
      }

      /* Footer Section */
      .footer-section {
        text-align: center;
        margin-top: 40px;
        padding-top: 20px;
      }

      .footer-message {
        font-size: 10px;
        color: #22C55E;  /* Green matching logo */
        font-style: normal;
        text-align: center;
      }

      @page {
        size: A4;
        margin: 0;
      }

      @media print {
        body {
          margin: 0;
        }
        .page-container {
          max-width: 100%;
          padding: 15mm;
        }
      }
    `;
  }

  /**
   * Get receipt-specific CSS styles matching the sample design
   */
  getReceiptStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: Arial, sans-serif;
        font-size: 10px;
        line-height: 1.4;
        color: #000;
        background: white;
      }

      .page-container {
        width: 100%;
        max-width: 210mm;
        margin: 0 auto;
        padding: 15mm 20mm;
      }

      /* Header Top Section */
      .header-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 15px;
      }

      .header-left-top {
        flex: 1;
      }

      .company-logo {
        margin-bottom: 5px;
      }

      .company-logo .logo-img {
        height: 45px;
        width: auto;
      }

      .company-name {
        font-size: 11px;
        color: #22C55E;
        margin-bottom: 15px;
        font-weight: 600;
      }

      .receipt-title {
        font-size: 20px;
        font-weight: bold;
        color: #1e40af;
        letter-spacing: 1px;
      }

      /* Header Bottom Section */
      .header-bottom {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid #e5e7eb;
      }

      .company-info {
        font-size: 9px;
        color: #333;
        line-height: 1.3;
      }

      .company-info p {
        margin: 1px 0;
      }

      .company-info .email {
        color: #2563eb;
      }

      .company-info .website {
        color: #2563eb;
      }

      .receipt-box {
        border: 1.5px solid #6b7280;
        padding: 10px 15px;
        min-width: 180px;
        background: white;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 3px;
        font-size: 9px;
        gap: 15px;
      }

      .info-row .label {
        font-weight: normal;
        white-space: nowrap;
      }

      .info-row .value {
        font-weight: normal;
        text-align: right;
      }

      /* Client Section */
      .client-section {
        margin: 20px 0;
      }

      .client-info {
        font-size: 9px;
      }

      .client-row {
        margin-bottom: 4px;
        display: flex;
      }

      .client-label {
        font-weight: normal;
        min-width: 100px;
        margin-right: 15px;
      }

      .client-value {
        flex: 1;
      }

      /* Payment Table Section */
      .payment-table-section {
        margin: 25px 0;
      }

      .payment-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 0;
      }

      .payment-table thead tr {
        background-color: #6b7280;
      }

      .payment-table th {
        color: white;
        padding: 8px;
        text-align: left;
        font-size: 10px;
        font-weight: normal;
      }

      .description-col {
        width: auto;
      }

      .amount-col {
        width: 110px;
        text-align: right;
        padding-right: 15px;
      }

      .payment-table tbody td {
        padding: 10px 8px;
        border: 1px solid #d1d5db;
        vertical-align: top;
        font-size: 9px;
      }

      .amount-cell {
        text-align: right;
        padding-right: 15px;
      }

      .commitment-paid {
        color: #22C55E;
        font-weight: bold;
      }

      .total-row {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 50px;
        padding: 12px 15px 12px 0;
        border-bottom: 2px solid #e5e7eb;
        margin-top: -1px;
      }

      .total-label {
        font-size: 11px;
        font-weight: normal;
      }

      .total-amount {
        font-size: 16px;
        font-weight: bold;
        color: #1e40af;
      }

      /* Footer Section */
      .footer-info {
        margin: 25px 0;
        padding: 15px 0;
      }

      .payment-info {
        font-size: 9px;
      }

      .payment-row {
        margin-bottom: 3px;
        display: flex;
        align-items: center;
      }

      .payment-label {
        font-weight: normal;
        min-width: 80px;
        margin-right: 15px;
      }

      .payment-value {
        flex: 1;
      }

      /* Thank You Message */
      .thank-you {
        text-align: center;
        margin-top: 40px;
        padding-top: 20px;
        font-size: 10px;
        color: #22C55E;
        font-style: normal;
      }

      @page {
        size: A4;
        margin: 0;
      }

      @media print {
        body {
          margin: 0;
        }
        .page-container {
          max-width: 100%;
          padding: 15mm;
        }
      }
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
