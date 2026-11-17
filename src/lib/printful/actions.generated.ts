/** GENERATED from Printful's official v2 OpenAPI spec
 *  (developers.printful.com/docs/v2-beta/openapi.json, spec 2.0.0-beta:
 *  40 paths, 52 operations,
 *  136 schemas).
 *  Regenerate: hidden_files/gen_printful_actions.py in the goal workspace.
 *  Do not edit by hand. */

export interface PrintfulAction {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  tag: string;
  summary: string;
  pathParams: string[];
  queryParams: string[];
  hasBody: boolean;
}

export const PRINTFUL_ACTIONS: PrintfulAction[] = [
  { id: 'downloadApprovalSheet', method: 'GET', path: '/v2/approval-sheets/{confirm_hash}/download', tag: 'Approval Sheets', summary: 'Download approval sheet PDF', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getApprovalSheets', method: 'GET', path: '/v2/approval-sheets', tag: 'Approval Sheets', summary: 'Retrieve a list of approval sheets', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getCategories', method: 'GET', path: '/v2/catalog-categories', tag: 'Catalog', summary: 'Retrieve a list of catalog categories', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getCategoriesByProductId', method: 'GET', path: '/v2/catalog-products/{id}/catalog-categories', tag: 'Catalog', summary: 'Retrieve a list of catalog product categories', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getCategoryById', method: 'GET', path: '/v2/catalog-categories/{id}', tag: 'Catalog', summary: 'Retrieve information about specific category', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getMockupTemplatesByProductId', method: 'GET', path: '/v2/catalog-products/{id}/mockup-templates', tag: 'Catalog', summary: 'Retrieve catalog product mockup templates', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getProductById', method: 'GET', path: '/v2/catalog-products/{id}', tag: 'Catalog', summary: 'Retrieve a single catalog product', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getProductImagesById', method: 'GET', path: '/v2/catalog-products/{id}/images', tag: 'Catalog', summary: 'Retrieve blank images for a catalog product', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getProductPricesById', method: 'GET', path: '/v2/catalog-products/{id}/prices', tag: 'Catalog', summary: 'Retrieve catalog product prices', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getProductShippingCountriesById', method: 'GET', path: '/v2/catalog-products/{id}/shipping-countries', tag: 'Catalog', summary: 'Retrieve the shipping countries for a Product', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getProductSizeGuideById', method: 'GET', path: '/v2/catalog-products/{id}/sizes', tag: 'Catalog', summary: 'Retrieve size guide for a catalog product', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getProductStockAvailabilityById', method: 'GET', path: '/v2/catalog-products/{id}/availability', tag: 'Catalog', summary: 'Retrieve catalog product stock availability', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getProductVariantsById', method: 'GET', path: '/v2/catalog-products/{id}/catalog-variants', tag: 'Catalog', summary: 'Retrieve information about catalog product variants', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getProducts', method: 'GET', path: '/v2/catalog-products', tag: 'Catalog', summary: 'Retrieve a list of catalog products', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getVariantById', method: 'GET', path: '/v2/catalog-variants/{id}', tag: 'Catalog', summary: 'Retrieve information about specific catalog variant', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getVariantImagesById', method: 'GET', path: '/v2/catalog-variants/{id}/images', tag: 'Catalog', summary: 'Retrieve blank images for a catalog variant', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getVariantPricesById', method: 'GET', path: '/v2/catalog-variants/{id}/prices', tag: 'Catalog', summary: 'Retrieve pricing information for the catalog variant', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getVariantStockAvailabilityById', method: 'GET', path: '/v2/catalog-variants/{id}/availability', tag: 'Catalog', summary: 'Retrieve catalog variant stock availability', pathParams: [], queryParams: [], hasBody: false },
  { id: 'retrieveMockupStylesByProductId', method: 'GET', path: '/v2/catalog-products/{id}/mockup-styles', tag: 'Catalog', summary: 'Retrieve catalog product mockup styles', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getCountries', method: 'GET', path: '/v2/countries', tag: 'Countries', summary: 'Retrieve a list of countries', pathParams: [], queryParams: ['limit'], hasBody: false },
  { id: 'addFile', method: 'POST', path: '/v2/files', tag: 'Files', summary: 'Add a new file', pathParams: [], queryParams: [], hasBody: true },
  { id: 'getFileById', method: 'GET', path: '/v2/files/{id}', tag: 'Files', summary: 'Retrieve a single file from the file library', pathParams: [], queryParams: [], hasBody: false },
  { id: 'createMockupGeneratorTasks', method: 'POST', path: '/v2/mockup-tasks', tag: 'Mockup Generator', summary: 'Create Mockup Generator tasks', pathParams: [], queryParams: [], hasBody: true },
  { id: 'getMockupGeneratorTasks', method: 'GET', path: '/v2/mockup-tasks', tag: 'Mockup Generator', summary: 'Retrieve Mockup Generator tasks', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getOAuthScopes', method: 'GET', path: '/v2/oauth-scopes', tag: 'OAuth Scopes', summary: 'Retrieve OAuth scopes', pathParams: [], queryParams: [], hasBody: false },
  { id: 'confirmOrder', method: 'POST', path: '/v2/orders/{order_id}/confirmation', tag: 'Orders', summary: 'Confirm an order', pathParams: [], queryParams: [], hasBody: false },
  { id: 'createItemByOrderId', method: 'POST', path: '/v2/orders/{order_id}/order-items', tag: 'Orders', summary: 'Create a new order item', pathParams: [], queryParams: [], hasBody: true },
  { id: 'createOrder', method: 'POST', path: '/v2/orders', tag: 'Orders', summary: 'Create a new order', pathParams: [], queryParams: [], hasBody: true },
  { id: 'createOrderEstimationTask', method: 'POST', path: '/v2/order-estimation-tasks', tag: 'Orders', summary: 'Create a new order estimation task', pathParams: [], queryParams: [], hasBody: true },
  { id: 'deleteItemById', method: 'DELETE', path: '/v2/orders/{order_id}/order-items/{order_item_id}', tag: 'Orders', summary: 'Delete Order Item', pathParams: [], queryParams: [], hasBody: false },
  { id: 'deleteOrder', method: 'DELETE', path: '/v2/orders/{order_id}', tag: 'Orders', summary: 'Delete an order', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getInvoiceByOrderId', method: 'GET', path: '/v2/orders/{order_id}/invoices', tag: 'Orders', summary: 'Retrieve an invoice', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getItemById', method: 'GET', path: '/v2/orders/{order_id}/order-items/{order_item_id}', tag: 'Orders', summary: 'Retrieve a single order item', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getItemsByOrderId', method: 'GET', path: '/v2/orders/{order_id}/order-items', tag: 'Orders', summary: 'Retrieve a list of order items', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getOrder', method: 'GET', path: '/v2/orders/{order_id}', tag: 'Orders', summary: 'Retrieve a single order', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getOrderEstimationTask', method: 'GET', path: '/v2/order-estimation-tasks', tag: 'Orders', summary: 'Retrieve an order estimation task', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getOrders', method: 'GET', path: '/v2/orders', tag: 'Orders', summary: 'Retrieve a list of orders', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getShipments', method: 'GET', path: '/v2/orders/{order_id}/shipments', tag: 'Orders', summary: 'Retrieve a list of shipments', pathParams: [], queryParams: [], hasBody: false },
  { id: 'updateItem', method: 'PATCH', path: '/v2/orders/{order_id}/order-items/{order_item_id}', tag: 'Orders', summary: 'Update an order item', pathParams: [], queryParams: [], hasBody: true },
  { id: 'updateOrder', method: 'PATCH', path: '/v2/orders/{order_id}', tag: 'Orders', summary: 'Update an order', pathParams: [], queryParams: [], hasBody: true },
  { id: 'calculateShppingRates', method: 'POST', path: '/v2/shipping-rates', tag: 'Shipping Rates', summary: 'Calculate Shipping Rates', pathParams: [], queryParams: ['store_id'], hasBody: true },
  { id: 'getReports', method: 'GET', path: '/v2/stores/{store_id}/statistics', tag: 'Stores', summary: 'Retrieve statistics for a single store', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getStoreById', method: 'GET', path: '/v2/stores/{store_id}', tag: 'Stores', summary: 'Retrieve a single store', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getStores', method: 'GET', path: '/v2/stores', tag: 'Stores', summary: 'Retrieves a list of stores', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getWarehouseProductById', method: 'GET', path: '/v2/warehouse-products/{warehouse_product_id}', tag: 'Warehouse Products', summary: 'Retrieve a single warehouse product', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getWarehouseProducts', method: 'GET', path: '/v2/warehouse-products', tag: 'Warehouse Products', summary: 'Retrieve a list of warehouse products', pathParams: [], queryParams: [], hasBody: false },
  { id: 'createWebhook', method: 'POST', path: '/v2/webhooks', tag: 'Webhook', summary: 'Set up webhook configuration', pathParams: [], queryParams: [], hasBody: true },
  { id: 'createWebhookEventConfiguration', method: 'POST', path: '/v2/webhooks/{eventType}', tag: 'Webhook', summary: 'Set up event configuration', pathParams: [], queryParams: [], hasBody: true },
  { id: 'disableWebhook', method: 'DELETE', path: '/v2/webhooks', tag: 'Webhook', summary: 'Disable webhook support', pathParams: [], queryParams: [], hasBody: false },
  { id: 'disableWebhookEvent', method: 'DELETE', path: '/v2/webhooks/{eventType}', tag: 'Webhook', summary: 'Disable support for event', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getWebhookEventConfiguration', method: 'GET', path: '/v2/webhooks/{eventType}', tag: 'Webhook', summary: 'Get event configuration', pathParams: [], queryParams: [], hasBody: false },
  { id: 'getWebhooks', method: 'GET', path: '/v2/webhooks', tag: 'Webhook', summary: 'Get webhook configuration', pathParams: [], queryParams: [], hasBody: false },
];

export const PRINTFUL_ACTION_BY_ID = new Map(PRINTFUL_ACTIONS.map((a) => [a.id, a]));
