require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const Payment = require("./models/payment.js");

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://react-auth-fontend.vercel.app",
    ];

    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

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

const uri =process.env.MONGO_URI
mongoose
  .connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", userSchema);

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

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("❌ Razorpay order error:", err);
    res.status(500).json({ message: "Failed to create order" });
  }
});

const crypto = require("crypto");

app.post("/verify-payment", async (req, res) => {
  const { order_id, payment_id, signature } = req.body;

  const body = order_id + "|" + payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");


  if (expectedSignature === signature) {
    try {
      const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const order = await instance.orders.fetch(order_id);
      await Payment.create({
        order_id,
        payment_id,
        signature,
        amount: order.amount / 100, 
        currency: order.currency,
        status: "paid",
      });
      res.json({ success: true, message: "Payment verified & saved" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ success: false, message: "DB Save Failed" });
    }
  } else {
    res.status(400).json({ success: false, message: "Invalid signature" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

app.get("/payments", async (req, res) => {
  try {
    const payments = await Payment.find();
    const paymentsWithRefunds = payments.map(payment => ({
      _id: payment._id,
      order_id: payment.order_id,
      payment_id: payment.payment_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt,
      signature: payment.signature,
      refund_id: payment.refund_id || null,
      refund_amount: payment.refund_amount || 0,
      refund_status: payment.refund_status || null,
      refunded_at: payment.refunded_at || null,
      net_amount: payment.amount - (payment.refund_amount || 0),
      is_refunded: payment.refund_status === "processed",
      refund_percentage: payment.refund_amount
        ? ((payment.refund_amount / payment.amount) * 100).toFixed(2) + '%'
        : '0%'
    }));

    res.json(paymentsWithRefunds);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch payments" });
  }
});



