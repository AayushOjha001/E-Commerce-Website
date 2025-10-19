export default function Message({ variant = "info", children }) {
  let bgColor = "bg-blue-100 text-blue-800";

  if (variant === "error") bgColor = "bg-red-100 text-red-800";
  if (variant === "success") bgColor = "bg-green-100 text-green-800";
  if (variant === "warning") bgColor = "bg-yellow-100 text-yellow-800";

  return (
    <div className={`p-4 rounded mb-4 ${bgColor}`}>
      {children}
    </div>
  );
}
