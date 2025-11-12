const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  order_id: String,
  payment_id: String,
  signature: String,
  amount: Number,
  currency: String,
  status: { type: String, default: "paid" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Payment", paymentSchema);
