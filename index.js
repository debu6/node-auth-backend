require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const Payment = require("./models/payment.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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
    res.json(payments);
  } catch (err) {
    console.error("❌ Error fetching payments:", err);
    res.status(500).json({ message: "Failed to fetch payments" });
  }
});
