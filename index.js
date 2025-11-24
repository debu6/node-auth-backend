require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const Payment = require("./models/payment.js");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORS Configuration for Production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001", 
     "https://react-auth-fontend.vercel.app", 
    ];
    
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // In production, check allowed origins
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// ✅ Connect MongoDB Atlas
const uri = "mongodb+srv://debu:DkJcc35lbecY0Ne9@cluster0.w7frrd9.mongodb.net/";
mongoose
  .connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", userSchema);

// 🔹 Signup API
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ message: "Username and password required" });

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const newUser = new User({ username, password });
    await newUser.save();

    res.status(201).json({ message: "Signup successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 🔹 Login API
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username, password });
    if (!user)
      return res.status(401).json({ message: "Invalid username or password" });

    res.json({ message: "Login successful", user: { username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// 🔹 Create Razorpay Order API
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ message: "Amount required" });

    const options = {
      amount: amount,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };
    
    const order = await razorpay.orders.create(options);
    res.json({
      id: order.id,
      currency: order.currency,
      amount: order.amount,
      key: process.env.RAZORPAY_KEY_ID, // send key for frontend
    });
  } catch (err) {
    console.error("❌ Razorpay order error:", err);
    res.status(500).json({ message: "Failed to create order" });
  }
});

// 🔹 Verify Payment API (optional but recommended)
const crypto = require("crypto");

app.post("/verify-payment", async(req, res) => {
  console.log("Verifying payment with body:", req.body);
  const { order_id, payment_id, signature } = req.body;

  const body = order_id + "|" + payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

    console.log("expectedSignature:", expectedSignature);
    console.log("received signature:", signature);

  if (expectedSignature === signature) {
     try {

       // 🟢 Fetch order details from Razorpay

  const instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  const order = await instance.orders.fetch(order_id);
console.log("before saving payment", order);
  // 🟢 Save payment in DB
  await Payment.create({
    order_id,
    payment_id,
    signature,
    amount: order.amount / 100, // converting paise → rupee
    currency: order.currency,
    status: "paid",
  });

  console.log("Payment saved successfully");


      res.json({ success: true, message: "Payment verified & saved" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ success: false, message: "DB Save Failed" });
    }
  } else {
    res.status(400).json({ success: false, message: "Invalid signature" });
  }
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// 🔹 Get All Payments API
app.get("/payments", async (req, res) => {
  try {
    const payments = await Payment.find();
    
    // Transform the data to include refund information
    const paymentsWithRefunds = payments.map(payment => ({
      _id: payment._id,
      order_id: payment.order_id,
      payment_id: payment.payment_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt,
      signature: payment.signature,
      
      // ✨ Refund Information
      refund_id: payment.refund_id || null,
      refund_amount: payment.refund_amount || 0,
      refund_status: payment.refund_status || null,
      refunded_at: payment.refunded_at || null,
      
      // 📊 Calculated Fields
      net_amount: payment.amount - (payment.refund_amount || 0),
      is_refunded: payment.refund_status === "processed",
      refund_percentage: payment.refund_amount 
        ? ((payment.refund_amount / payment.amount) * 100).toFixed(2) + '%'
        : '0%'
    }));

    res.json(paymentsWithRefunds);
  } catch (err) {
    console.error("❌ Error fetching payments:", err);
    res.status(500).json({ message: "Failed to fetch payments" });
  }
});

// 🔹 Create Refund API
app.post("/refund", async (req, res) => {
  try {
    const { payment_id, amount, reason } = req.body;

    if (!payment_id) {
      return res.status(400).json({ message: "Payment ID is required" });
    }

    // Find the payment record
    const payment = await Payment.findOne({ payment_id });
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (payment.refund_status === "processed") {
      return res.status(400).json({ message: "Payment already refunded" });
    }

    // Calculate refund amount (use provided amount or full amount)
    const refundAmount = amount || payment.amount * 100; // Convert to paise

    // Create refund with Razorpay
    const refund = await razorpay.payments.refund(payment_id, {
      amount: refundAmount,
      notes: {
        reason: reason || "Customer request",
        refund_date: new Date().toISOString()
      }
    });

    // Update payment record with refund details
    await Payment.updateOne(
      { payment_id },
      {
        refund_id: refund.id,
        refund_amount: refund.amount / 100, // Convert back to rupees
        refund_status: refund.status === "processed" ? "processed" : "pending",
        refunded_at: new Date()
      }
    );

    res.json({
      success: true,
      message: "Refund initiated successfully",
      refund: {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        payment_id: payment_id
      }
    });

  } catch (err) {
    console.error("❌ Refund error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to process refund",
      error: err.message 
    });
  }
});
 
// 🔹 Get Refund Status API
app.get("/refund/:refund_id", async (req, res) => {
  try {
    const { refund_id } = req.params;

    // Fetch refund status from Razorpay
    const refund = await razorpay.refunds.fetch(refund_id);

    // Update local database if status changed
    if (refund.status === "processed") {
      await Payment.updateOne(
        { refund_id },
        { refund_status: "processed" }
      );
    }

    res.json({
      success: true,
      refund: {
        id: refund.id,
        payment_id: refund.payment_id,
        amount: refund.amount / 100,
        status: refund.status,
        created_at: refund.created_at
      }
    });

  } catch (err) {
    console.error("❌ Get refund error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch refund status",
      error: err.message 
    });
  }
});

// 🔔 Razorpay Webhook - Auto Update Refund Status
app.post("/webhook", async (req, res) => {
  try {
    const webhookSignature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify webhook signature (optional but recommended)
    if (webhookSecret) {
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (expectedSignature !== webhookSignature) {
        console.log("❌ Invalid webhook signature");
        return res.status(400).json({ message: "Invalid signature" });
      }
    }

    const { event, payload } = req.body;

    // Handle refund events
    if (event === "refund.processed") {
      const refund = payload.refund.entity;
      
      console.log("🔔 Refund processed webhook:", refund.id);
      
      // Update payment record
      await Payment.updateOne(
        { refund_id: refund.id },
        { 
          refund_status: "processed",
          refunded_at: new Date(refund.created_at * 1000) // Convert timestamp
        }
      );
      
      console.log("✅ Database updated for refund:", refund.id);
    }
    
    // Handle refund failed events
    if (event === "refund.failed") {
      const refund = payload.refund.entity;
      
      console.log("❌ Refund failed webhook:", refund.id);
      
      await Payment.updateOne(
        { refund_id: refund.id },
        { refund_status: "failed" }
      );
    }

    res.status(200).json({ message: "Webhook processed successfully" });

  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).json({ message: "Webhook processing failed" });
  }
});
