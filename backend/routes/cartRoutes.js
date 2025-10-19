import express from "express"
const router = express.Router();

import { protect } from "../middleware/authMiddleware.js";
import { getUserCart, addToCart, removeFromCart } from "../controllers/cartController.js";

router.route("/").get(protect, getUserCart).post(protect, addToCart);
router.route("/:productId").delete(protect, removeFromCart)

export default router;