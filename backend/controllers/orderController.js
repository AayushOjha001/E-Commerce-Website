import asyncHandler from "express-async-handler";
import Order from "../models/orderModel.js";
import Cart from "../models/cartModel.js";
import Product from "../models/productModel.js";

// @desc    Create new order from cart
// @route   POST /api/orders
// @access  Private
export const createOrder = asyncHandler(async (req, res) => {
  const { orderItems, shippingAddress, paymentMethod } = req.body;

  if (!orderItems || orderItems.length ==0){
    res.status(400);
    throw new Error("No order items")
  }
  for (const item of orderItems) {
  const productExists = await Product.findById(item.product);
  if (!productExists) {
    res.status(404);
    throw new Error(`Product not found: ${item.product}`);
  }
  if (product.countInStock < item.qty) {
    res.status(400);
    throw new Error(`Not enough stock for ${product.name}`);
  }
}

  const cart = await Cart.findOne({ user: req.user._id }).populate(
    "items.product",
    "name price"
  );

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error("Your cart is empty");
  }

 const cartItems = cart.items.map((item) => ({
    name: item.product.name,
    qty: item.qty,
    price: item.product.price,
    product: item.product._id,
  }));

  const totalPrice = cartItems.reduce(
    (acc, item) => acc + item.price * item.qty,
    0
  );

  const order = new Order({
    user: req.user._id,
    orderItems,
    shippingAddress,
    paymentMethod,
    totalPrice,
  });

  const createdOrder = await order.save();

  // Optionally clear the cart
  cart.items = [];
  await cart.save();

  res.status(201).json(createdOrder);
});

export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id });
  res.json(orders);
});

// @desc    Get a single order by ID
// @route   GET /api/orders/:id
// @access  Private
export const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email");

  if (order) res.json(order);
  else {
    res.status(404);
    throw new Error("Order not found");
  }
});
