import { Link } from "react-router-dom";

export default function ProductScreen() {
  // Static data for now. The route param is intentionally unused until this
  // page fetches a real product; the Next.js port does that in Batch 4 (T4.4).
  const product = {
    name: "iPhone 14",
    price: 999,
    description: "The latest iPhone with A15 Bionic chip and amazing camera.",
    image: "https://via.placeholder.com/400",
  };

  return (
    <div className="max-w-3xl mx-auto bg-white shadow-md rounded-lg p-6">
      <img src={product.image} alt={product.name} className="w-full h-80 object-cover rounded-lg" />
      <h2 className="text-2xl font-bold mt-4">{product.name}</h2>
      <p className="text-gray-600 mt-2">${product.price}</p>
      <p className="mt-4 text-gray-700">{product.description}</p>

      <div className="mt-6 flex gap-4">
        <Link to="/cart" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Add to Cart
        </Link>
        <Link to="/" className="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400">
          Back
        </Link>
      </div>
    </div>
  );
}
