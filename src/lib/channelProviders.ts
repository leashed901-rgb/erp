/** Sales-channel providers for the Channels pages (pack 3). */
export const CHANNEL_PROVIDERS: Record<string, { label: string; channelType: string }> = {
  shopify: { label: 'Shopify', channelType: 'marketplace' },
  etsy: { label: 'Etsy', channelType: 'marketplace' },
  tiktok: { label: 'TikTok Shop', channelType: 'marketplace' },
  amazon: { label: 'Amazon', channelType: 'marketplace' },
  ebay: { label: 'eBay', channelType: 'marketplace' },
  whatnot: { label: 'Whatnot', channelType: 'marketplace' },
  'facebook-marketplace': { label: 'Facebook Marketplace', channelType: 'marketplace' },
  website: { label: 'Website', channelType: 'ecommerce' },
  ecommerce: { label: 'Ecommerce', channelType: 'ecommerce' },
};
