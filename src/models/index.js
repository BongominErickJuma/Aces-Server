/**
 * Models Index
 * Exports all database models
 */

const User = require('./User.model');
const Quotation = require('./Quotation.model');
const Receipt = require('./Receipt.model');
const Notification = require('./Notification.model');
const AuditLog = require('./AuditLog.model');
const Counter = require('./Counter.model');

module.exports = {
  User,
  Quotation,
  Receipt,
  Notification,
  AuditLog,
  Counter
};
