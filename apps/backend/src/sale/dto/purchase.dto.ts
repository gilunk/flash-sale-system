import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty } from "class-validator";
import { IsExist } from "src/common/rules/IsExist";

export class PurchaseRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsExist('Sale', 'id')
  sale_id!: string;

  @ApiProperty({ example: 'johndoe@example.com' })
  @IsEmail() 
  @IsNotEmpty()
  email!: string;
}

export class PurchaseResponseDto {
  orderId!: string;
  status!: 'CONFIRMED';
}