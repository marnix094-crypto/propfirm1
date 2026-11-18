import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { TradingModule } from '../trading/trading.module.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutController, ProductsController } from './commerce.controller.js';
import { FakePaymentProvider, PAYMENT_PROVIDER } from './payment-provider.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [TradingModule],
  controllers: [ProductsController, CheckoutController],
  providers: [
    ProductsService,
    CheckoutService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => {
        switch (c.paymentProvider) {
          case 'fake':
            return new FakePaymentProvider(c.appBaseUrl);
        }
      },
    },
  ],
  exports: [CheckoutService],
})
export class CommerceModule {}
