import Image from "next/image";

interface ProductCardProps {
  productName: string;
  productImageUrl?: string | null
}

export function ProductCard({ productName, productImageUrl }: ProductCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-sky-300 bg-gradient-to-br from-sky-100 to-sky-200 p-6 shadow-sm h-[475px]">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-white/70">
        <div className="flex h-full w-full items-center justify-center text-sky-900/60">
          <Image 
            src={productImageUrl || ''}
            width={800}
            height={600}
            loading="lazy"
            alt="Product Image"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-widest text-sky-900/70">
          Flash Sale
        </span>
        <h2 className="text-2xl font-semibold leading-tight text-sky-950">
          {productName}
        </h2>
        <span className="text-xs"></span>
      </div>
    </div>
  );
}
