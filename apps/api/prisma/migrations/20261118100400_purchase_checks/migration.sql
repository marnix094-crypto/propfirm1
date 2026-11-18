-- Purchases: snapshotted amounts must be consistent and positive.
ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_quantity_check" CHECK ("quantity" BETWEEN 1 AND 5),
  ADD CONSTRAINT "Purchase_amounts_check" CHECK (
    "unitPriceMinor" > 0 AND "accountSizeMinor" > 0 AND "totalMinor" = "unitPriceMinor" * "quantity"
  ),
  ADD CONSTRAINT "Purchase_one_source_check" CHECK (
    ("productId" IS NOT NULL) <> ("quoteId" IS NOT NULL)
  );

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_amounts_check" CHECK ("priceMinor" > 0 AND "accountSizeMinor" > 0);
