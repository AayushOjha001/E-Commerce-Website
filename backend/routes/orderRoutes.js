import express from "express";
const router = express.Router();
import { protect } from "../middleware/authMiddleware.js";
import {
  createOrder,
  getMyOrders,
  getOrderById,
} from "../controllers/orderController.js";

router.route("/").post(protect, createOrder);
router.route("/myorders").get(protect, getMyOrders);
router.route("/:id").get(protect, getOrderById);

export default router;
