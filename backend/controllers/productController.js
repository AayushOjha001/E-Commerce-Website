import asyncHandler from "express-async-handler";
import Product from "../models/productModel.js"

export const getProduct = asyncHandler(async(req,res)=>{
    const products = await Product.find({});
    res.json(products);
})

export const getProductById = asyncHandler(async(req,res)=>{
    const product = Product.findById(req.params.id);

    if(product){
        res.json(product)
    } else{
        res.status(404);
        throw new Error("Product not found");
    }
})

export const createProduct = asyncHandler(async(req,res)=>{
    const {name, price, image, brand, category, countInStock, description} = req.body;

    const product = new Product({
        name,
        price,
        image,
        brand,
        category,
        countInStock,
        description,
    });

    const createdProducted = await product.save();

    res.status(201).json(createdProducted)
});