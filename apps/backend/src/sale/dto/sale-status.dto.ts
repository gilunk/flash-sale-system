export class SaleStatusDto {
  saleId!: string;
  productId!: string;
  productName!: string;
  startsAt!: string; 
  endsAt!: string;
  totalStock!: number;
  remainingStock!: number;
  state!: 'PENDING' | 'ACTIVE' | 'ENDED' | 'SOLD_OUT';
}