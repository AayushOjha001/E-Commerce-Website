import express from 'express'
import dotenv from "dotenv"
import cors from "cors"
import connectDB from './config/db.js'
import User from "./models/userModel.js";
import userRoutes from "./routes/userRoutes.js"
import productRoutes from "./routes/productRoutes.js"
import cartRoutes from "./routes/cartRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";

//Load env vars
dotenv.config()

//Connect to MongoDb
connectDB()

const app = express()

// const testUser = new User({
//   name: "Test User",
//   email: "test@example.com",
//   password: "123456",
// });
// await testUser.save();
// console.log("User saved:", testUser);

app.use(express.json()) //parses the incoming json request data into req.body
app.use(cors()) // tell the client's web browser that it's permissible to access your server's resources 

//routes
app.use("/api/users", userRoutes)
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);


app.get("/", (req,res)=>{
    res.send("API is running.....")
})

const PORT = process.env.PORT || 5000
app.listen(PORT, ()=>console.log(`App is listening to ${PORT}`))