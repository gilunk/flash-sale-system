import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@ValidatorConstraint({ name: 'IsExist', async: true })
@Injectable()
export class ExistConstraint implements ValidatorConstraintInterface {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async validate(value: any, args: ValidationArguments): Promise<boolean> {
    const [model, property = 'id'] = args.constraints as [Prisma.ModelName, string?];

    if (!value || !model) return false;

    // Prisma exposes model accessors with a lowercase first letter
    // (`prisma.product`, not `prisma.Product`), so we have to translate
    // ModelName ("Product") into its delegate key ("product").
    const modelKey = (model.charAt(0).toLowerCase() + model.slice(1)) as
      Uncapitalize<Prisma.ModelName>;

    // Each delegate has its own typed args, so we widen for the dynamic lookup.
    const delegate = this.prisma[modelKey] as unknown as {
      findFirst: (args: {
        where: Record<string, unknown>;
      }) => Promise<unknown>;
    };

    const record = await delegate.findFirst({
      where: { [property]: value },
    });

    return record !== null;
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} entered is not valid`;
  }
}

export function IsExist(
  model: Prisma.ModelName,
  field: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [model, field],
      validator: ExistConstraint,
    });
  };
}
