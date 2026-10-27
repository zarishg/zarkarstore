'use strict';
/* Default text for the content pages. Owners edit these in Admin > Pages.
   Simple markup: "## Heading", "### Sub heading" (a question on the FAQ page), "- list item",
   blank line = new paragraph, **bold**, [link text](https://... or #/shop).
   Tokens: {{brand}} {{email}} {{phone}} {{address}} {{hours}} {{whatsapp}} {{freeship}}
   Anything in [square brackets] is a placeholder that still needs your real information. */
module.exports = [
{ slug: 'about', title: 'Our Story', footer: 1, sort: 10, body: `
## Made by hand, from start to finish
{{brand}} is a pottery studio from Pakistan. We make hand-painted blue pottery, kashi kari and clay ware in our own workshop, shaped on our own wheel and fired in our own kiln.

[See how we make it](#/workshop)

## What we make
- **Blue pottery:** cobalt and white florals in the Multan tradition.
- **Kashi kari:** colourful tile-style florals, birds and patterns, painted by hand.
- **Clay:** warm, glazed clay pieces and clay cookware for the kitchen and table.

## Our promise
- Every piece is shaped, painted and fired by us.
- Hand-painted means small variations. They are the sign of a handmade piece, not a flaw.
- Every order is cushioned and double-boxed so it reaches you whole.
` },
{ slug: 'contact', title: 'Contact us', footer: 1, sort: 20, body: `
## We would love to hear from you
Questions about a piece, an order or a custom idea? Send us a message or reach us on WhatsApp. We reply as soon as we can.

Our online store is open all day, every day. Place your order any time.
` },
{ slug: 'shipping', title: 'Shipping and delivery', footer: 1, sort: 30, body: `
## Where we ship
We ship across Pakistan and worldwide.

## How shipping is priced
The shipping cost is worked out at checkout from your country and the weight of your order. You see the exact amount before you pay. {{freeship}}

## Processing time
Every order is carefully checked and packed before it leaves our workshop. Made-to-order pieces take longer, and we will tell you before you pay.

## Delivery time
- **Pakistan:** 8 to 10 days from your order.
- **Worldwide:** depends on your country. We confirm the delivery time for your country when you order.

## Packing
Every piece is wrapped, cushioned and double-boxed to survive the journey.

## Tracking
When your order ships we add the courier and tracking number to your order. You can follow it any time on the [Track order](#/track) page with your order code.

## Customs and import duties
Orders sent abroad may be charged import duties or taxes by your country. These are paid by the customer and are not included in our prices.
` },
{ slug: 'returns', title: 'Returns and breakage', footer: 1, sort: 40, body: `
## If your piece arrives damaged
Please message us on WhatsApp or by email within one day (24 hours) of delivery. Send photos of the outer box, the packing and the damaged piece. We will replace the piece or refund you, whichever you prefer.

## If you change your mind
Because every piece is handmade for you, we do not accept returns for change of mind. If you have any concern about your order, message us and we will do our best to help.

## Made-to-order pieces
Custom and made-to-order pieces cannot be returned, because they are made specially for you.

## Refunds
Approved refunds are sent back by the same method you paid with, or by bank transfer, within 7 working days.

## Handmade variation
Each piece is hand-painted, so colours and patterns can differ slightly from the photos. This is not a defect.
` },
{ slug: 'faq', title: 'Questions and answers', footer: 1, sort: 50, body: `
### Is everything handmade?
Yes. We shape, paint, glaze and fire every piece in our own workshop.

### Will my piece look exactly like the photo?
Very close, but never identical. Each piece is painted by hand, so small differences in the pattern and colour are normal.

### Do you ship worldwide?
Yes. Shipping is calculated at checkout from your country and the weight of your order.

### How can I pay?
In Pakistan: cash on delivery, JazzCash, Easypaisa or bank transfer. For orders abroad: bank transfer, and card where it is available at checkout.

### How do I track my order?
Open [Track order](#/track) and enter your order code with your email or phone number.

### Can I order something made just for me?
Yes. Please see [Custom orders](#/custom).

### Do you sell wholesale?
Yes, to shops, cafes, hotels and gift sellers. Please see [Wholesale](#/wholesale).

### Are your pieces food safe?
Our blue pottery is food safe. Our clay cookware is made for cooking. Our other pieces are made for serving and display. Vases, fountains, planters and decorative pieces are for decoration only. Please see our [Care guide](#/care).

### Can I use them in the dishwasher or microwave?
Please wash by hand and avoid the microwave and dishwasher for painted pieces. Clay cookware is for stovetop or oven use as described in the care guide. See also our [Care guide](#/care).
` },
{ slug: 'care', title: 'Care guide', footer: 1, sort: 60, body: `
## Everyday care
- Wash by hand with warm water and a soft sponge.
- Avoid sudden changes of temperature, such as pouring boiling water into a cold piece.
- Dry well before storing, and stack with a soft cloth between pieces.

## Blue pottery and kashi kari
- Avoid harsh scrubbers and strong detergents so the painted surface stays bright.
- Keep decorative pieces away from direct heat.

## Clay cookware
- Before first use, soak the pot in clean water for a few hours, dry it, then warm it slowly on a low flame.
- Always start on a low flame and increase the heat slowly.
- Do not heat an empty pot, and do not place a hot pot on a cold or wet surface.

## Food safety
Blue pottery is food safe. Clay cookware is made for cooking. Other pieces are for serving and display. Vases, fountains, planters and decorative pieces are for decoration only and should not be used for food.

## Questions
Message us on WhatsApp and we will gladly help.
` },
{ slug: 'wholesale', title: 'Wholesale', footer: 1, sort: 70, body: `
## Pottery for shops, cafes, hotels and gift sellers
Because we make every piece ourselves, we can supply wholesale orders directly from our workshop with no middlemen.

- Minimum order: we agree it with you based on what you need.
- Wholesale prices: sent on request.
- Lead time: confirmed with your quote.
- Shipping: we ship across Pakistan and worldwide.

Send us a few details below and we will reply with our wholesale price list.
` },
{ slug: 'custom', title: 'Custom orders', footer: 1, sort: 80, body: `
## Made just for you
We can make pieces in the size, colour and design you want, from a single gift to a full set. Because we shape and paint everything ourselves, we can match your idea closely.

## How it works
- **Tell us your idea.** Send the details and any reference photos below.
- **We reply with a quote** and a time estimate.
- **We make it.** Your piece is shaped, painted and fired in our workshop.
- **We pack and ship it** with tracking.

## Good to know
- Lead time: confirmed with your quote.
- Deposit: 50% in advance, the rest before dispatch.
- Custom pieces cannot be returned.
` },
{ slug: 'privacy', title: 'Privacy policy', footer: 1, sort: 90, body: `
## Who we are
This store is run by {{brand}} (Pakistan). You can reach us at {{email}}.

## What we collect
- **Orders:** your name, email, phone number, delivery address and what you ordered.
- **Messages:** what you write to us in contact, wholesale and custom order forms.
- **On your device:** your bag and currency choice are saved in your browser so they are remembered. We do not use advertising trackers.

## How we use it
- To prepare, ship and track your order and to contact you about it.
- To answer your questions.

## Who we share it with
Only with the couriers and payment providers needed to deliver and pay for your order. We do not sell your information.

## How long we keep it
We keep order records for as long as needed for our accounts and for any legal requirement.

## Your choices
You can ask us to correct or delete your information by writing to us. We will do so unless we must keep it by law.

## Changes
We may update this policy. The latest version is always on this page.
` },
{ slug: 'terms', title: 'Terms of sale', footer: 1, sort: 100, body: `
## Orders and prices
Prices are in Pakistani rupees. Prices in other currencies are shown for convenience and are converted at the rate set on our store. An order is accepted when we confirm it.

## Payment
You can pay with the methods shown at checkout. Orders paid by bank transfer, JazzCash or Easypaisa are prepared after we receive your payment.

## Shipping
See our [Shipping and delivery](#/shipping) page. Delivery times are estimates.

## Returns
See our [Returns and breakage](#/returns) page.

## Handmade products
Each piece is handmade, so small differences in shape, colour and pattern are normal and are not defects.

## Our responsibility
We take great care in making and packing every piece. To the extent allowed by law, we are not liable for indirect losses.

## Governing law
These terms are governed by the laws of Pakistan.

## Contact
Questions about these terms: {{email}}.
` }
];
