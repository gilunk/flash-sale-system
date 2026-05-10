export class SaleStatusDto {
  saleId!: string;
  productId!: string;
  productName!: string;
  productImageUrl!: string | null;   // ← add
  startsAt!: string; 
  endsAt!: string;
  totalStock!: number;
  remainingStock!: number;
  state!: 'PENDING' | 'ACTIVE' | 'ENDED' | 'SOLD_OUT';
}