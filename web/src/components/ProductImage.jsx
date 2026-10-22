// Foto del producto o, si no tiene, un recuadro con sus iniciales en los colores de la marca.
export function ProductImage({ product }) {
  if (product.image_url) return <img className="product-img" src={product.image_url} alt={product.name} loading="lazy" />;
  const initials = product.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <div className="product-img placeholder" aria-hidden="true">{initials}</div>;
}
