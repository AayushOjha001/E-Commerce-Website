import asyncHandler from "express-async-handler"
import Cart from "../models/cartModel.js"

export const getUserCart = asyncHandler(async(req,res)=>{
    const cart = await Cart.findOne({user: req.user._id}).populate(
        "items.product",
        "name price image"
    );

    res.status(200).json(cart || {items: [] });
});

export const addToCart = asyncHandler(async(req,res)=>{
    const {productId, qty} = req.body

    let cart = await Cart.findOne({user: req.user._id})

    if(!cart){
        cart = new Cart({user: req.user._id, items:[]})
    }

    const itemIndex = cart.items.findIndex(
        (item) => item.product.toString() == productId
    );

    if(itemIndex > -1){
        cart.items[itemIndex].qty = qty;
    } else{
        cart.items.push({product: productId, qty})
    }

    const updatedCart = await cart.save();
    const populatedCart = await updatedCart.populate(
        "items.product",
        "name price image"
    );
    res.status(200).json(populatedCart)
})

export const removeFromCart = asyncHandler(async(req,res)=>{
    const { productId } = req.params

    const cart = await Cart.findOne({user: req.user._id});

    if(!cart){
        res.status(404);
        throw new Error("Cart not found");
    }

    cart.items = cart.items.filter(
        (item)=>item.product.toString() !== productId
    )

    const updatedCart = await cart.save();
    const populatedCart = await updatedCart.populate(
        "items.product",
        "name price image"
    )
    res.status(200).json(populatedCart);
})