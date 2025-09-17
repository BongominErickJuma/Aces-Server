/**
 * Email Service Module
 * Handles all email templates and sending functionality
 */

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
    this.companyInfo = {
      name:
        process.env.COMPANY_NAME ||
        'Aces Movers and Relocation Company Limited',
      email: process.env.EMAIL_FROM || 'infor@acesmovers.com',
      website: process.env.COMPANY_WEBSITE || 'https://acesmovers.com',
      supportEmail: process.env.SUPPORT_EMAIL || 'infor@acesmovers.com',
      phone: process.env.COMPANY_PHONE || '+256 778 259191',
      phoneSecondary: process.env.COMPANY_PHONE_SECONDARY || '+256 725 711730',
      address:
        process.env.COMPANY_ADDRESS ||
        'Kigowa2 Kulambiro Kisaasi Ring Road 83AD, Kampala, Uganda'
    };
  }

  /**
   * Create email transporter based on environment
   */
  createTransporter() {
    if (process.env.NODE_ENV === 'production') {
      // Production: SendGrid configuration
      if (process.env.SENDGRID_API_KEY) {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        return sgMail;
      }
    }

    // Development: Mailtrap configuration
    return nodemailer.createTransport({
      host: process.env.MAILTRAP_HOST,
      port: process.env.MAILTRAP_PORT,
      auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS
      }
    });
  }

  /**
   * Base email template with modern company branding matching logo colors
   */
  getBaseTemplate(content, includeFooter = true) {
    const footer = includeFooter
      ? `
      <div style="margin-top: 50px; padding: 30px; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h3 style="color: #f1f5f9; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">
            ${this.companyInfo.name}
          </h3>
          <div style="width: 60px; height: 3px; background: linear-gradient(90deg, #2e8a56, #0000ff); margin: 0 auto; border-radius: 2px;"></div>
        </div>

        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; margin-bottom: 25px;">
          <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; text-align: center; min-width: 140px;">
            <div style="color: #2e8a56; font-size: 18px; margin-bottom: 5px;">📞</div>
            <p style="color: #cbd5e1; font-size: 12px; margin: 0; font-weight: 500;">${this.companyInfo.phone}</p>
            <p style="color: #cbd5e1; font-size: 12px; margin: 0; font-weight: 500;">${this.companyInfo.phoneSecondary}</p>
          </div>

          <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; text-align: center; min-width: 140px;">
            <div style="color: #0000ff; font-size: 18px; margin-bottom: 5px;">✉️</div>
            <p style="color: #cbd5e1; font-size: 12px; margin: 0; font-weight: 500;">${this.companyInfo.supportEmail}</p>
          </div>

          <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; text-align: center; min-width: 140px;">
            <div style="color: #2e8a56; font-size: 18px; margin-bottom: 5px;">🌐</div>
            <a href="${this.companyInfo.website}" style="color: #cbd5e1; font-size: 12px; text-decoration: none; font-weight: 500;">${this.companyInfo.website}</a>
          </div>
        </div>

        <div style="text-align: center; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
          <p style="color: #64748b; font-size: 12px; margin: 0; line-height: 1.6;">
            ${this.companyInfo.address}
          </p>
          <p style="color: #475569; font-size: 11px; margin: 10px 0 0 0;">
            © ${new Date().getFullYear()} ${this.companyInfo.name}. All rights reserved.
          </p>
        </div>
      </div>
    `
      : '';

    // Company logo - using local SVG path instead of Cloudinary
    const logoUrl = process.env.COMPANY_LOGO_URL || '/img/Aces_logo.svg';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email from ${this.companyInfo.name}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

          @media only screen and (max-width: 600px) {
            .email-container {
              width: 100% !important;
              margin: 0 !important;
              border-radius: 0 !important;
            }
            .email-header {
              padding: 25px 20px !important;
              border-radius: 0 !important;
            }
            .email-content {
              padding: 25px 20px !important;
            }
            .email-footer {
              padding: 25px 20px !important;
              margin-top: 30px !important;
            }
            .footer-cards {
              flex-direction: column !important;
              gap: 15px !important;
            }
            .footer-card {
              min-width: auto !important;
              width: 100% !important;
            }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 20px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); line-height: 1.6;">
        <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
          <!-- Header -->
          <div class="email-header" style="background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%); padding: 40px 30px; text-align: center; position: relative; overflow: hidden; border-bottom: 3px solid #2e8a56;">
            <!-- Subtle decorative background -->
            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: radial-gradient(circle at 20% 20%, rgba(46, 138, 86, 0.03) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(0, 0, 255, 0.02) 0%, transparent 50%); background-size: 100px 100px;"></div>

            <div style="position: relative; z-index: 1;">
              <img src="${logoUrl}" alt="${this.companyInfo.name} Logo" style="max-height: 80px; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto;" />
              <div style="width: 80px; height: 3px; background: linear-gradient(90deg, #2e8a56, #0000ff); margin: 15px auto; border-radius: 2px;"></div>
              <p style="color: #64748b; margin: 0; font-size: 16px; font-weight: 500; letter-spacing: 0.025em;">
                Professional Moving & Relocation Services
              </p>
            </div>
          </div>

          <!-- Content -->
          <div class="email-content" style="padding: 40px 30px; background-color: #ffffff;">
            ${content}
          </div>

          <!-- Footer -->
          ${footer}
        </div>

        <!-- Email client compatibility -->
        <div style="display: none; max-height: 0; overflow: hidden;">
          &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Welcome Email Template
   * Sent when a new user is created
   */
  getWelcomeEmailTemplate(user, password, isTemporary = true) {
    const loginUrl = `${process.env.CLIENT_URL}/login`;

    const content = `
      <h2 style="color: #333; margin-bottom: 20px;">Welcome to ${this.companyInfo.name}!</h2>
      
      <p style="color: #555; line-height: 1.6;">
        Hello ${user.fullName},
      </p>
      
      <p style="color: #555; line-height: 1.6;">
        Your account has been successfully created in our document management system. 
        You can now log in and start generating quotations and receipts for our clients.
      </p>
      
      <div style="background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #2e8a56;">
        <h3 style="color: #1e293b; margin-top: 0; font-weight: 600;">Your Login Credentials:</h3>
        <p style="margin: 10px 0;"><strong>Email:</strong> ${user.email}</p>
        <p style="margin: 10px 0;"><strong>Password:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">${password}</code></p>
        ${
          isTemporary
            ? `
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin-top: 15px;">
          <p style="color: #856404; margin: 0;">
            <strong>⚠️ Important:</strong> This is a temporary password. 
            Please change it immediately after your first login for security reasons.
          </p>
        </div>
        `
            : ''
        }
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}"
           style="background: linear-gradient(135deg, #2e8a56 0%, #22c55e 100%);
                  color: white;
                  padding: 15px 35px;
                  text-decoration: none;
                  border-radius: 8px;
                  display: inline-block;
                  font-weight: 600;
                  font-size: 16px;
                  box-shadow: 0 4px 6px rgba(46, 138, 86, 0.2);
                  transition: all 0.3s ease;">
          Login to Your Account
        </a>
      </div>
      
      <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin: 25px 0;">
        <h3 style="color: #333; margin-top: 0;">Getting Started:</h3>
        <ol style="color: #555; line-height: 1.8; padding-left: 20px;">
          <li>Log in using the credentials above</li>
          <li><strong>Complete your profile</strong> with all required information</li>
          <li>Start generating quotations and receipts</li>
          <li>Track your document history and statistics</li>
        </ol>
      </div>
      
      ${
        !user.profileCompleted
          ? `
      <div style="background-color: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
        <p style="color: #0c5460; margin: 0;">
          <strong>📝 Note:</strong> You must complete your profile before you can generate documents. 
          This includes adding your phone number, emergency contact, and banking details.
        </p>
      </div>
      `
          : ''
      }
      
      <p style="color: #555; line-height: 1.6;">
        If you have any questions or need assistance, please don't hesitate to contact your administrator 
        or reply to this email.
      </p>
      
      <p style="color: #555; line-height: 1.6; margin-top: 20px;">
        Best regards,<br>
        <strong>The ${this.companyInfo.name} Team</strong>
      </p>
    `;

    return {
      subject: `Welcome to ${this.companyInfo.name} Document System`,
      html: this.getBaseTemplate(content),
      text: this.getPlainTextFromHtml(content)
    };
  }

  /**
   * Password Reset Email Template
   */
  getPasswordResetEmailTemplate(user, resetToken) {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;

    const content = `
      <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
      
      <p style="color: #555; line-height: 1.6;">
        Hello ${user.fullName},
      </p>
      
      <p style="color: #555; line-height: 1.6;">
        We received a request to reset the password for your ${this.companyInfo.name} account. 
        If you made this request, click the button below to reset your password.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}"
           style="background: linear-gradient(135deg, #dc3545 0%, #ef4444 100%);
                  color: white;
                  padding: 15px 35px;
                  text-decoration: none;
                  border-radius: 8px;
                  display: inline-block;
                  font-weight: 600;
                  font-size: 16px;
                  box-shadow: 0 4px 6px rgba(220, 53, 69, 0.2);
                  transition: all 0.3s ease;">
          Reset Password
        </a>
      </div>
      
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
        <p style="color: #856404; margin: 0;">
          <strong>⏰ Time Sensitive:</strong> This password reset link will expire in <strong>10 minutes</strong> 
          for security reasons.
        </p>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="color: #666; font-size: 13px; margin: 0;">
          <strong>🔒 Security Notice:</strong><br>
          • Never share this reset link with anyone<br>
          • We will never ask for your password via email<br>
          • If you didn't request this reset, please ignore this email and your password will remain unchanged
        </p>
      </div>
      
      <p style="color: #999; font-size: 12px; margin-top: 20px;">
        If the button above doesn't work, copy and paste this link into your browser:<br>
        <a href="${resetUrl}" style="color: #007bff; word-break: break-all;">${resetUrl}</a>
      </p>
      
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
      
      <p style="color: #555; line-height: 1.6;">
        For security concerns, please contact our support team immediately.
      </p>
      
      <p style="color: #555; line-height: 1.6; margin-top: 20px;">
        Best regards,<br>
        <strong>The ${this.companyInfo.name} Security Team</strong>
      </p>
    `;

    return {
      subject: `Reset Your Password - ${this.companyInfo.name}`,
      html: this.getBaseTemplate(content),
      text: this.getPlainTextFromHtml(content)
    };
  }

  /**
   * Password Changed Confirmation Email
   */
  getPasswordChangedEmailTemplate(user) {
    const content = `
      <h2 style="color: #28a745; margin-bottom: 20px;">Password Changed Successfully</h2>
      
      <p style="color: #555; line-height: 1.6;">
        Hello ${user.fullName},
      </p>
      
      <p style="color: #555; line-height: 1.6;">
        This email confirms that your password has been successfully changed.
      </p>
      
      <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0;">
        <p style="color: #155724; margin: 0;">
          <strong>✓ Password Updated:</strong> ${new Date().toLocaleString()}
        </p>
      </div>
      
      <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
        <p style="color: #721c24; margin: 0;">
          <strong>⚠️ Wasn't You?</strong><br>
          If you did not make this change, your account may be compromised. 
          Please contact our support team immediately at ${this.companyInfo.supportEmail}
        </p>
      </div>
      
      <p style="color: #555; line-height: 1.6; margin-top: 20px;">
        Best regards,<br>
        <strong>The ${this.companyInfo.name} Security Team</strong>
      </p>
    `;

    return {
      subject: `Password Changed Successfully - ${this.companyInfo.name}`,
      html: this.getBaseTemplate(content),
      text: this.getPlainTextFromHtml(content)
    };
  }

  /**
   * Quotation Generated Email Template
   */
  getQuotationGeneratedEmailTemplate(quotation, generatedBy, pdfBuffer = null) {
    const viewUrl = `${process.env.CLIENT_URL}/quotations/${quotation._id}`;

    const content = `
      <h2 style="color: #333; margin-bottom: 20px;">New Quotation Generated</h2>
      
      <p style="color: #555; line-height: 1.6;">
        A new quotation has been generated in the system.
      </p>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
        <h3 style="color: #007bff; margin-top: 0;">Quotation Details:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Quotation Number:</strong></td>
            <td style="padding: 8px 0; color: #333;">${quotation.quotationNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Client Name:</strong></td>
            <td style="padding: 8px 0; color: #333;">${quotation.client.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Type:</strong></td>
            <td style="padding: 8px 0; color: #333;">${quotation.type}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Total Amount:</strong></td>
            <td style="padding: 8px 0; color: #333; font-size: 18px; font-weight: bold;">
              ${quotation.pricing.currency} ${quotation.pricing.totalAmount.toLocaleString()}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Valid Until:</strong></td>
            <td style="padding: 8px 0; color: #333;">${new Date(quotation.validity.validUntil).toLocaleDateString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Generated By:</strong></td>
            <td style="padding: 8px 0; color: #333;">${generatedBy.fullName}</td>
          </tr>
        </table>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${viewUrl}"
           style="background: linear-gradient(135deg, #0000ff 0%, #2563eb 100%);
                  color: white;
                  padding: 15px 35px;
                  text-decoration: none;
                  border-radius: 8px;
                  display: inline-block;
                  font-weight: 600;
                  font-size: 16px;
                  box-shadow: 0 4px 6px rgba(0, 0, 255, 0.2);
                  transition: all 0.3s ease;">
          View Quotation
        </a>
      </div>
      
      ${
        pdfBuffer
          ? `
      <p style="color: #666; font-size: 14px; text-align: center;">
        📎 The quotation PDF is attached to this email
      </p>
      `
          : ''
      }
      
      <p style="color: #555; line-height: 1.6; margin-top: 20px;">
        Best regards,<br>
        <strong>The ${this.companyInfo.name} Team</strong>
      </p>
    `;

    return {
      subject: `New Quotation #${quotation.quotationNumber}`,
      html: this.getBaseTemplate(content),
      text: this.getPlainTextFromHtml(content),
      attachments: pdfBuffer
        ? [
            {
              filename: `Quotation-${quotation.quotationNumber}.pdf`,
              content: pdfBuffer
            }
          ]
        : []
    };
  }

  /**
   * Receipt Generated Email Template
   */
  getReceiptGeneratedEmailTemplate(receipt, generatedBy, pdfBuffer = null) {
    const viewUrl = `${process.env.CLIENT_URL}/receipts/${receipt._id}`;

    const content = `
      <h2 style="color: #333; margin-bottom: 20px;">Receipt Generated - Payment Confirmation</h2>
      
      <p style="color: #555; line-height: 1.6;">
        A receipt has been generated confirming payment.
      </p>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
        <h3 style="color: #28a745; margin-top: 0;">Receipt Details:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Receipt Number:</strong></td>
            <td style="padding: 8px 0; color: #333;">${receipt.receiptNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Client Name:</strong></td>
            <td style="padding: 8px 0; color: #333;">${receipt.client.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Receipt Type:</strong></td>
            <td style="padding: 8px 0; color: #333;">${receipt.receiptType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Total Amount:</strong></td>
            <td style="padding: 8px 0; color: #333; font-size: 18px; font-weight: bold;">
              ${receipt.payment.currency} ${receipt.payment.totalAmount.toLocaleString()}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Amount Paid:</strong></td>
            <td style="padding: 8px 0; color: #28a745; font-weight: bold;">
              ${receipt.payment.currency} ${receipt.payment.amountPaid.toLocaleString()}
            </td>
          </tr>
          ${
            receipt.payment.balance > 0
              ? `
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Balance Due:</strong></td>
            <td style="padding: 8px 0; color: #dc3545; font-weight: bold;">
              ${receipt.payment.currency} ${receipt.payment.balance.toLocaleString()}
            </td>
          </tr>
          `
              : ''
          }
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Payment Status:</strong></td>
            <td style="padding: 8px 0;">
              <span style="background-color: ${receipt.payment.status === 'paid' ? '#28a745' : '#ffc107'}; 
                           color: white; 
                           padding: 4px 8px; 
                           border-radius: 4px; 
                           font-size: 12px;">
                ${receipt.payment.status.toUpperCase()}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Generated By:</strong></td>
            <td style="padding: 8px 0; color: #333;">${generatedBy.fullName}</td>
          </tr>
        </table>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${viewUrl}"
           style="background: linear-gradient(135deg, #2e8a56 0%, #22c55e 100%);
                  color: white;
                  padding: 15px 35px;
                  text-decoration: none;
                  border-radius: 8px;
                  display: inline-block;
                  font-weight: 600;
                  font-size: 16px;
                  box-shadow: 0 4px 6px rgba(46, 138, 86, 0.2);
                  transition: all 0.3s ease;">
          View Receipt
        </a>
      </div>
      
      ${
        pdfBuffer
          ? `
      <p style="color: #666; font-size: 14px; text-align: center;">
        📎 The receipt PDF is attached to this email
      </p>
      `
          : ''
      }
      
      <p style="color: #555; line-height: 1.6; margin-top: 20px;">
        Thank you for your business!<br><br>
        Best regards,<br>
        <strong>The ${this.companyInfo.name} Team</strong>
      </p>
    `;

    return {
      subject: `Receipt #${receipt.receiptNumber} - Payment Confirmation`,
      html: this.getBaseTemplate(content),
      text: this.getPlainTextFromHtml(content),
      attachments: pdfBuffer
        ? [
            {
              filename: `Receipt-${receipt.receiptNumber}.pdf`,
              content: pdfBuffer
            }
          ]
        : []
    };
  }

  /**
   * Payment Reminder Email Template
   */
  getPaymentReminderEmailTemplate(receipt, daysOverdue = 0) {
    const paymentUrl = `${process.env.CLIENT_URL}/make-payment/${receipt._id}`;

    const content = `
      <h2 style="color: #dc3545; margin-bottom: 20px;">Payment Reminder</h2>
      
      <p style="color: #555; line-height: 1.6;">
        Dear ${receipt.client.name},
      </p>
      
      <p style="color: #555; line-height: 1.6;">
        This is a friendly reminder that you have an outstanding balance on your account.
      </p>
      
      <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0;">
        <h3 style="color: #856404; margin-top: 0;">Outstanding Invoice Details:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Invoice Number:</strong></td>
            <td style="padding: 8px 0; color: #333;">${receipt.receiptNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Original Amount:</strong></td>
            <td style="padding: 8px 0; color: #333;">
              ${receipt.payment.currency} ${receipt.payment.totalAmount.toLocaleString()}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Amount Paid:</strong></td>
            <td style="padding: 8px 0; color: #333;">
              ${receipt.payment.currency} ${receipt.payment.amountPaid.toLocaleString()}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Balance Due:</strong></td>
            <td style="padding: 8px 0; color: #dc3545; font-size: 20px; font-weight: bold;">
              ${receipt.payment.currency} ${receipt.payment.balance.toLocaleString()}
            </td>
          </tr>
          ${
            daysOverdue > 0
              ? `
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Days Overdue:</strong></td>
            <td style="padding: 8px 0; color: #dc3545; font-weight: bold;">
              ${daysOverdue} days
            </td>
          </tr>
          `
              : ''
          }
        </table>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${paymentUrl}"
           style="background: linear-gradient(135deg, #2e8a56 0%, #22c55e 100%);
                  color: white;
                  padding: 15px 35px;
                  text-decoration: none;
                  border-radius: 8px;
                  display: inline-block;
                  font-weight: 600;
                  font-size: 16px;
                  box-shadow: 0 4px 6px rgba(46, 138, 86, 0.2);
                  transition: all 0.3s ease;">
          Make Payment
        </a>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h4 style="color: #333; margin-top: 0;">Payment Options:</h4>
        <ul style="color: #555; line-height: 1.8;">
          <li>Bank Transfer to our account</li>
          <li>Mobile Money (MTN or Airtel)</li>
          <li>Cash payment at our office</li>
        </ul>
      </div>
      
      <p style="color: #555; line-height: 1.6;">
        Please make the payment at your earliest convenience to avoid any service interruptions.
        If you have already made this payment, please disregard this reminder.
      </p>
      
      <p style="color: #555; line-height: 1.6;">
        For any questions or concerns, please contact us at ${this.companyInfo.supportEmail} 
        or call ${this.companyInfo.phone}.
      </p>
      
      <p style="color: #555; line-height: 1.6; margin-top: 20px;">
        Thank you for your prompt attention to this matter.<br><br>
        Best regards,<br>
        <strong>The ${this.companyInfo.name} Accounts Team</strong>
      </p>
    `;

    return {
      subject: `Payment Reminder - Invoice #${receipt.receiptNumber}`,
      html: this.getBaseTemplate(content),
      text: this.getPlainTextFromHtml(content)
    };
  }

  /**
   * Document Shared Email Template
   */
  getDocumentSharedEmailTemplate(
    document,
    sharedBy,
    shareLink,
    documentType = 'document'
  ) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);

    const content = `
      <h2 style="color: #333; margin-bottom: 20px;">Document Shared With You</h2>
      
      <p style="color: #555; line-height: 1.6;">
        ${sharedBy.fullName} has shared a ${documentType} with you.
      </p>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
        <h3 style="color: #007bff; margin-top: 0;">Document Information:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Document Type:</strong></td>
            <td style="padding: 8px 0; color: #333;">${documentType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Document Number:</strong></td>
            <td style="padding: 8px 0; color: #333;">${document.documentNumber || document.quotationNumber || document.receiptNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Shared By:</strong></td>
            <td style="padding: 8px 0; color: #333;">${sharedBy.fullName} (${sharedBy.email})</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;"><strong>Link Expires:</strong></td>
            <td style="padding: 8px 0; color: #dc3545; font-weight: bold;">
              ${expiryDate.toLocaleDateString()} (7 days)
            </td>
          </tr>
        </table>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${shareLink}"
           style="background: linear-gradient(135deg, #0000ff 0%, #2563eb 100%);
                  color: white;
                  padding: 15px 35px;
                  text-decoration: none;
                  border-radius: 8px;
                  display: inline-block;
                  font-weight: 600;
                  font-size: 16px;
                  box-shadow: 0 4px 6px rgba(0, 0, 255, 0.2);
                  transition: all 0.3s ease;">
          View Document
        </a>
      </div>
      
      <div style="background-color: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0;">
        <p style="color: #0c5460; margin: 0;">
          <strong>🔒 Security Notice:</strong> This link is secure and will expire in 7 days. 
          Do not share this link with unauthorized persons.
        </p>
      </div>
      
      <p style="color: #999; font-size: 12px; margin-top: 20px;">
        If the button above doesn't work, copy and paste this link into your browser:<br>
        <a href="${shareLink}" style="color: #007bff; word-break: break-all;">${shareLink}</a>
      </p>
      
      <p style="color: #555; line-height: 1.6; margin-top: 20px;">
        Best regards,<br>
        <strong>The ${this.companyInfo.name} Team</strong>
      </p>
    `;

    return {
      subject: `${sharedBy.fullName} shared a ${documentType} with you`,
      html: this.getBaseTemplate(content),
      text: this.getPlainTextFromHtml(content)
    };
  }

  /**
   * Convert HTML to plain text (basic implementation)
   */
  getPlainTextFromHtml(html) {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * Send email using the configured transporter
   */
  async sendEmail(to, emailContent) {
    try {
      const mailOptions = {
        from: this.companyInfo.email,
        to: to,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        attachments: emailContent.attachments || []
      };

      if (
        process.env.NODE_ENV === 'production' &&
        process.env.SENDGRID_API_KEY
      ) {
        // SendGrid implementation
        const msg = {
          to: to,
          from: this.companyInfo.email,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
          attachments: emailContent.attachments
        };

        await this.transporter.send(msg);
      } else {
        // Nodemailer implementation (Mailtrap)
        await this.transporter.sendMail(mailOptions);
      }

      console.log(
        `✉️ Email sent successfully to ${to}: ${emailContent.subject}`
      );
      return true;
    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(user, password, isTemporary = true) {
    const emailContent = this.getWelcomeEmailTemplate(
      user,
      password,
      isTemporary
    );
    return await this.sendEmail(user.email, emailContent);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken) {
    const emailContent = this.getPasswordResetEmailTemplate(user, resetToken);
    return await this.sendEmail(user.email, emailContent);
  }

  /**
   * Send password changed confirmation
   */
  async sendPasswordChangedEmail(user) {
    const emailContent = this.getPasswordChangedEmailTemplate(user);
    return await this.sendEmail(user.email, emailContent);
  }

  /**
   * Send quotation generated notification
   */
  async sendQuotationGeneratedEmail(
    quotation,
    generatedBy,
    recipients,
    pdfBuffer = null
  ) {
    const emailContent = this.getQuotationGeneratedEmailTemplate(
      quotation,
      generatedBy,
      pdfBuffer
    );

    // Send to multiple recipients if provided
    const emailPromises = recipients.map(recipient =>
      this.sendEmail(recipient, emailContent)
    );
    return await Promise.all(emailPromises);
  }

  /**
   * Send receipt generated notification
   */
  async sendReceiptGeneratedEmail(
    receipt,
    generatedBy,
    recipients,
    pdfBuffer = null
  ) {
    const emailContent = this.getReceiptGeneratedEmailTemplate(
      receipt,
      generatedBy,
      pdfBuffer
    );

    // Send to multiple recipients if provided
    const emailPromises = recipients.map(recipient =>
      this.sendEmail(recipient, emailContent)
    );
    return await Promise.all(emailPromises);
  }

  /**
   * Send payment reminder
   */
  async sendPaymentReminderEmail(receipt, daysOverdue = 0) {
    const emailContent = this.getPaymentReminderEmailTemplate(
      receipt,
      daysOverdue
    );
    return await this.sendEmail(receipt.client.email, emailContent);
  }

  /**
   * Send document shared notification
   */
  async sendDocumentSharedEmail(
    document,
    sharedBy,
    recipientEmail,
    shareLink,
    documentType
  ) {
    const emailContent = this.getDocumentSharedEmailTemplate(
      document,
      sharedBy,
      shareLink,
      documentType
    );
    return await this.sendEmail(recipientEmail, emailContent);
  }

  /**
   * Format currency amount for email display
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
   * Format date for email display
   */
  formatDate(date) {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  /**
   * Send quotation email with PDF attachment
   */
  async sendQuotationEmail({
    to,
    quotation,
    sender,
    pdfBuffer,
    customMessage
  }) {
    const subject = `Quotation ${quotation.quotationNumber} - ${this.companyInfo.name}`;
    const clientName = quotation.client.name;
    const totalAmount = this.formatCurrency(
      quotation.pricing.totalAmount,
      quotation.pricing.currency
    );
    const validUntil = this.formatDate(quotation.validity.validUntil);
    const quotationType =
      quotation.type.charAt(0).toUpperCase() + quotation.type.slice(1);

    const content = `
      <h2 style="color: #2563eb; margin-bottom: 20px;">Quotation ${quotation.quotationNumber}</h2>
      
      <p>Dear ${clientName},</p>
      
      <p>Thank you for choosing ${this.companyInfo.name}. We are pleased to provide you with the following quotation for your ${quotationType} move:</p>
      
      ${
        customMessage
          ? `
        <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
          <p style="margin: 0;"><strong>Message from ${sender.fullName}:</strong></p>
          <p style="margin: 5px 0 0 0;">${customMessage}</p>
        </div>
      `
          : ''
      }
      
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #1f2937; margin-top: 0;">Quotation Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Quotation Number:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${quotation.quotationNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Type:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${quotationType} Move</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>From:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${quotation.locations.from}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>To:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${quotation.locations.to}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Moving Date:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${this.formatDate(quotation.locations.movingDate)}</td>
          </tr>
          <tr style="background: #e5f3ff;">
            <td style="padding: 12px 0; font-weight: bold; font-size: 16px;"><strong>Total Amount:</strong></td>
            <td style="padding: 12px 0; text-align: right; font-weight: bold; font-size: 16px; color: #2563eb;">${totalAmount}</td>
          </tr>
        </table>
      </div>
      
      <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e;"><strong>⏰ Valid Until:</strong> ${validUntil}</p>
        <p style="margin: 5px 0 0 0; color: #92400e; font-size: 14px;">Please review the attached detailed quotation and contact us if you have any questions.</p>
      </div>
      
      <p>To proceed with booking, please contact us at:</p>
      <ul>
        <li><strong>Phone:</strong> ${this.companyInfo.phone}</li>
        <li><strong>Email:</strong> ${this.companyInfo.email}</li>
      </ul>
      
      <p>Thank you for considering ${this.companyInfo.name} for your moving needs.</p>
      
      <p>Best regards,<br>
      <strong>${sender.fullName}</strong><br>
      ${this.companyInfo.name}</p>
    `;

    const htmlContent = this.getBaseTemplate(content);

    const emailContent = {
      subject: subject,
      html: htmlContent,
      text: `Quotation ${quotation.quotationNumber} from ${this.companyInfo.name}`,
      attachments: [
        {
          filename: `quotation-${quotation.quotationNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    return await this.sendEmail(to, emailContent);
  }

  /**
   * Send receipt email with PDF attachment
   */
  async sendReceiptEmail({ to, receipt, sender, pdfBuffer, customMessage }) {
    const subject = `Receipt ${receipt.receiptNumber} - ${this.companyInfo.name}`;
    const clientName = receipt.client.name;
    const totalAmount = this.formatCurrency(
      receipt.payment.totalAmount,
      receipt.payment.currency
    );
    const amountPaid = this.formatCurrency(
      receipt.payment.amountPaid,
      receipt.payment.currency
    );
    const balance = this.formatCurrency(
      receipt.payment.balance,
      receipt.payment.currency
    );
    const receiptType =
      receipt.receiptType.charAt(0).toUpperCase() +
      receipt.receiptType.slice(1);

    const content = `
      <h2 style="color: #2563eb; margin-bottom: 20px;">Receipt ${receipt.receiptNumber}</h2>
      
      <p>Dear ${clientName},</p>
      
      <p>Thank you for your payment. This email confirms the receipt of your payment for our services:</p>
      
      ${
        customMessage
          ? `
        <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
          <p style="margin: 0;"><strong>Message from ${sender.fullName}:</strong></p>
          <p style="margin: 5px 0 0 0;">${customMessage}</p>
        </div>
      `
          : ''
      }
      
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #1f2937; margin-top: 0;">Payment Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Receipt Number:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${receipt.receiptNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Type:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${receiptType} Receipt</td>
          </tr>
          ${
            receipt.locations?.from && receipt.locations?.to
              ? `
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>From:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${receipt.locations.from}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>To:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${receipt.locations.to}</td>
          </tr>
          `
              : ''
          }
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Total Amount:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${totalAmount}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Amount Paid:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #16a34a;">${amountPaid}</td>
          </tr>
          <tr style="background: ${receipt.payment.balance > 0 ? '#fef3c7' : '#dcfce7'};">
            <td style="padding: 12px 0; font-weight: bold; font-size: 16px;"><strong>Balance Due:</strong></td>
            <td style="padding: 12px 0; text-align: right; font-weight: bold; font-size: 16px; color: ${receipt.payment.balance > 0 ? '#d97706' : '#16a34a'};">${balance}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Payment Status:</strong></td>
            <td style="padding: 8px 0; text-align: right;">
              <span style="background: ${
                receipt.payment.status === 'paid'
                  ? '#dcfce7'
                  : receipt.payment.status === 'partial'
                    ? '#fef3c7'
                    : '#fee2e2'
              }; color: ${
                receipt.payment.status === 'paid'
                  ? '#166534'
                  : receipt.payment.status === 'partial'
                    ? '#92400e'
                    : '#991b1b'
              }; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                ${receipt.payment.status.toUpperCase()}
              </span>
            </td>
          </tr>
        </table>
      </div>
      
      ${
        receipt.payment.balance > 0
          ? `
        <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e;"><strong>💰 Outstanding Balance:</strong> ${balance}</p>
          <p style="margin: 5px 0 0 0; color: #92400e; font-size: 14px;">Please contact us to arrange payment for the remaining balance.</p>
        </div>
      `
          : `
        <div style="background: #dcfce7; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; color: #166534;"><strong>✅ Payment Complete</strong></p>
          <p style="margin: 5px 0 0 0; color: #166534; font-size: 14px;">Thank you for your complete payment. Your account is settled.</p>
        </div>
      `
      }
      
      <p>For any questions about this receipt or your services, please contact us at:</p>
      <ul>
        <li><strong>Phone:</strong> ${this.companyInfo.phone}</li>
        <li><strong>Email:</strong> ${this.companyInfo.email}</li>
      </ul>
      
      <p>Thank you for choosing ${this.companyInfo.name}.</p>
      
      <p>Best regards,<br>
      <strong>${sender.fullName}</strong><br>
      ${this.companyInfo.name}</p>
    `;

    const htmlContent = this.getBaseTemplate(content);

    const emailContent = {
      subject: subject,
      html: htmlContent,
      text: `Receipt ${receipt.receiptNumber} from ${this.companyInfo.name}`,
      attachments: [
        {
          filename: `receipt-${receipt.receiptNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    return await this.sendEmail(to, emailContent);
  }
}

// Export singleton instance
module.exports = new EmailService();
