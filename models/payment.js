const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  order_id: String,
  payment_id: String,
  signature: String,
  amount: Number,
  currency: String,
  status: { type: String, default: "paid" },
  refund_id: String,
  refund_amount: Number,
  refund_status: { type: String, enum: ["pending", "processed", "failed"], default: null },
  refunded_at: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Payment", paymentSchema);
