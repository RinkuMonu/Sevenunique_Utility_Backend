const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  transaction_type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  balance_after: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['Success', 'Pending', 'Failed'],
    default: 'Pending',
  },
  bankRRN: {
    type: String
  },
  payment_mode: {
    type: String,
    enum: ['wallet', 'bank_transfer', 'cash'],
  },
  transaction_reference_id: {
    type: String,
  },
  description: {
    type: String,
    default: '',
  },
  meta: {
    type: Map,
    of: String,
    default: {},
  }
}, {
  timestamps: true,
}
);

const Transaction = mongoose.model('Transaction', TransactionSchema);

module.exports = Transaction;
