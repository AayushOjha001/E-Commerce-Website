import ProductCard from "../components/ProductCard";

const products = [
  { id: 1, name: "iPhone 14", price: 999, image: "https://via.placeholder.com/200" },
  { id: 2, name: "AirPods Pro", price: 199, image: "https://via.placeholder.com/200" },
  { id: 3, name: "MacBook Air", price: 1299, image: "https://via.placeholder.com/200" },
];

export default function HomeScreen() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
