import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:4000/api/v1',
);

final apiProvider = Provider<ApiClient>((ref) => ApiClient());
final healthProvider = FutureProvider.autoDispose<String>(
  (ref) async => ref.read(apiProvider).getHealth(),
);

class ApiClient {
  ApiClient()
    : dio = Dio(
        BaseOptions(
          baseUrl: apiBaseUrl,
          connectTimeout: const Duration(seconds: 8),
          receiveTimeout: const Duration(seconds: 12),
        ),
      );
  final Dio dio;

  Future<String> getHealth() async {
    try {
      final response = await dio.get('/health/ready');
      return (response.data['status'] as String?) ?? 'unknown';
    } catch (_) {
      return 'offline';
    }
  }

  Future<List<Map<String, dynamic>>> list(String path) async {
    try {
      final response = await dio.get(path);
      final payload = response.data is Map
          ? response.data as Map
          : <dynamic, dynamic>{};
      final data = payload['data'];
      if (data is List)
        return data
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
      if (data is Map && data['items'] is List)
        return (data['items'] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
    } catch (_) {
      // Offline and provider outages are first-class states for the mobile client.
    }
    return <Map<String, dynamic>>[];
  }

  Future<Map<String, dynamic>?> one(String path) async {
    try {
      final response = await dio.get(path);
      final payload = response.data is Map
          ? response.data as Map
          : <dynamic, dynamic>{};
      final data = payload['data'];
      return data is Map ? Map<String, dynamic>.from(data) : null;
    } catch (_) {
      return null;
    }
  }
}

class Product {
  Product({
    required this.id,
    required this.slug,
    required this.title,
    this.imageUrl,
    this.price,
    this.mrp,
    this.sellerName,
    this.inStock = false,
  });
  factory Product.fromJson(Map<String, dynamic> json) {
    final price = json['price'];
    final mrp = json['mrp'];
    return Product(
      id: '${json['productId'] ?? json['product_id'] ?? ''}',
      slug: '${json['slug'] ?? ''}',
      title: '${json['title'] ?? 'NovaMart product'}',
      imageUrl: json['imageUrl'] as String? ?? json['image_url'] as String?,
      price: price is Map
          ? price['display'] as String?
          : json['selling_price_paise']?.toString(),
      mrp: mrp is Map
          ? mrp['display'] as String?
          : json['mrp_paise']?.toString(),
      sellerName:
          json['sellerName'] as String? ?? json['seller_name'] as String?,
      inStock:
          json['inStock'] as bool? ??
          (json['available_quantity'] as num? ?? 0) > 0,
    );
  }
  final String id;
  final String slug;
  final String title;
  final String? imageUrl;
  final String? price;
  final String? mrp;
  final String? sellerName;
  final bool inStock;
}

void main() => runApp(const ProviderScope(child: NovaMartCustomerApp()));

class NovaMartCustomerApp extends StatelessWidget {
  const NovaMartCustomerApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'NovaMart',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff0d7773)),
      useMaterial3: true,
    ),
    routerConfig: GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const CustomerHome()),
        GoRoute(
          path: '/categories',
          builder: (_, __) => const CategoriesPage(),
        ),
        GoRoute(
          path: '/search',
          builder: (_, state) =>
              SearchPage(query: state.uri.queryParameters['q'] ?? ''),
        ),
        GoRoute(
          path: '/product/:slug',
          builder: (_, state) =>
              ProductPage(slug: state.pathParameters['slug']!),
        ),
        GoRoute(path: '/nova', builder: (_, __) => const NovaPage()),
        GoRoute(path: '/cart', builder: (_, __) => const CartPage()),
        GoRoute(path: '/orders', builder: (_, __) => const OrdersPage()),
        GoRoute(path: '/account', builder: (_, __) => const AccountPage()),
      ],
    ),
  );
}

class CustomerHome extends ConsumerWidget {
  const CustomerHome({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => CustomerScaffold(
    selectedIndex: 0,
    title: 'NovaMart',
    onSearch: () => context.go('/search'),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Shop with confidence',
          style: Theme.of(
            context,
          ).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'Verified sellers, authoritative prices and delivery you can follow.',
        ),
        const SizedBox(height: 20),
        Card(
          color: Theme.of(context).colorScheme.primaryContainer,
          child: const Padding(
            padding: EdgeInsets.all(20),
            child: Text(
              'Personalised offers, safe checkout and post-purchase support in one place.',
            ),
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'Trending products',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        FutureBuilder<List<Map<String, dynamic>>>(
          future: ref
              .read(apiProvider)
              .list('/catalog/products?limit=8&sort=popularity'),
          builder: (_, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting)
              return const LinearProgressIndicator();
            final products = (snapshot.data ?? [])
                .map(Product.fromJson)
                .toList();
            if (products.isEmpty)
              return const EmptyCard(
                message: 'Catalogue is offline or warming up. Pull to retry.',
              );
            return SizedBox(
              height: 250,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: products.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (_, index) =>
                    ProductTile(product: products[index]),
              ),
            );
          },
        ),
        const SizedBox(height: 20),
        ref
            .watch(healthProvider)
            .when(
              data: (status) => ListTile(
                leading: Icon(
                  status == 'ready' ? Icons.check_circle : Icons.cloud_off,
                ),
                title: const Text('Service status'),
                subtitle: Text(status),
              ),
              loading: () => const LinearProgressIndicator(),
              error: (_, __) =>
                  const ListTile(title: Text('Service unavailable')),
            ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () => context.go('/categories'),
          icon: const Icon(Icons.grid_view),
          label: const Text('Browse categories'),
        ),
      ],
    ),
  );
}

class CategoriesPage extends ConsumerWidget {
  const CategoriesPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => CustomerScaffold(
    selectedIndex: 1,
    title: 'Categories',
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: ref.read(apiProvider).list('/catalog/categories'),
      builder: (_, snapshot) {
        final categories = snapshot.data ?? [];
        if (categories.isEmpty)
          return const EmptyCard(
            message: 'Categories are unavailable offline.',
          );
        return ListView.builder(
          padding: const EdgeInsets.all(20),
          itemCount: categories.length,
          itemBuilder: (_, index) {
            final category = categories[index];
            return Card(
              child: ExpansionTile(
                title: Text('${category['name'] ?? 'Category'}'),
                subtitle: Text(
                  '${(category['children'] as List?)?.length ?? 0} subcategories',
                ),
                children: [
                  for (final child
                      in (category['children'] as List? ?? const []))
                    ListTile(
                      title: Text('${(child as Map)['name'] ?? 'Subcategory'}'),
                      onTap: () => context.go(
                        '/search?q=${Uri.encodeComponent('${child['name']}')}',
                      ),
                    ),
                ],
              ),
            );
          },
        );
      },
    ),
  );
}

class SearchPage extends StatefulWidget {
  const SearchPage({required this.query, super.key});
  final String query;
  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  late final TextEditingController controller = TextEditingController(
    text: widget.query,
  );
  Future<List<Map<String, dynamic>>>? results;
  @override
  void initState() {
    super.initState();
    if (widget.query.isNotEmpty)
      results = ApiClient().list(
        '/search?q=${Uri.encodeComponent(widget.query)}&limit=24',
      );
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => CustomerScaffold(
    title: 'Search',
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        SearchBar(
          controller: controller,
          hintText: 'Search products, brands and more',
          onSubmitted: (value) => setState(
            () => results = ApiClient().list(
              '/search?q=${Uri.encodeComponent(value)}&limit=24',
            ),
          ),
        ),
        const SizedBox(height: 20),
        if (results == null)
          const EmptyCard(message: 'Search by product, category or brand.')
        else
          FutureBuilder<List<Map<String, dynamic>>>(
            future: results,
            builder: (_, snapshot) {
              final products = (snapshot.data ?? [])
                  .map(Product.fromJson)
                  .toList();
              if (products.isEmpty)
                return const EmptyCard(
                  message: 'No matching products. Try a broader search.',
                );
              return Column(
                children: [
                  for (final product in products)
                    ProductListTile(product: product),
                ],
              );
            },
          ),
      ],
    ),
  );
}

class ProductPage extends ConsumerWidget {
  const ProductPage({required this.slug, super.key});
  final String slug;
  @override
  Widget build(BuildContext context, WidgetRef ref) => CustomerScaffold(
    title: 'Product details',
    body: FutureBuilder<Map<String, dynamic>?>(
      future: ref
          .read(apiProvider)
          .one('/catalog/products/${Uri.encodeComponent(slug)}'),
      builder: (_, snapshot) {
        final data = snapshot.data;
        if (data == null)
          return const EmptyCard(
            message: 'Product unavailable. Check your connection and retry.',
          );
        final product = Product.fromJson(data);
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (product.imageUrl != null)
              Image.network(
                product.imageUrl!,
                height: 280,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox(
                  height: 280,
                  child: Icon(Icons.image_not_supported_outlined, size: 64),
                ),
              ),
            Text(
              product.title,
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              product.price ?? 'Price unavailable',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                color: Theme.of(context).colorScheme.primary,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (product.mrp != null)
              Text(
                'MRP ${product.mrp}',
                style: const TextStyle(decoration: TextDecoration.lineThrough),
              ),
            const SizedBox(height: 16),
            Text(
              product.sellerName == null
                  ? 'Verified NovaMart seller'
                  : 'Sold by ${product.sellerName}',
            ),
            const SizedBox(height: 16),
            Card(
              child: ListTile(
                leading: Icon(
                  product.inStock ? Icons.check_circle : Icons.remove_circle,
                ),
                title: Text(
                  product.inStock ? 'In stock' : 'Currently unavailable',
                ),
                subtitle: const Text(
                  'Delivery and tax are revalidated at checkout.',
                ),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: product.inStock ? () => context.go('/cart') : null,
              icon: const Icon(Icons.add_shopping_cart),
              label: const Text('Add to cart'),
            ),
            OutlinedButton(
              onPressed: () => context.go('/cart'),
              child: const Text('View cart'),
            ),
          ],
        );
      },
    ),
  );
}

class NovaPage extends StatelessWidget {
  const NovaPage({super.key});
  @override
  Widget build(BuildContext context) => CustomerScaffold(
    selectedIndex: 2,
    title: 'Nova',
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Ask Nova',
          style: Theme.of(
            context,
          ).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'A grounded shopping assistant that only recommends products returned by NovaMart.',
        ),
        const SizedBox(height: 24),
        Card(
          child: ListTile(
            leading: const Icon(Icons.auto_awesome),
            title: const Text('Try “headphones under ₹20,000”'),
            onTap: () => context.go('/search?q=headphones'),
          ),
        ),
        const EmptyCard(
          message:
              'Nova suggestions use live catalogue data when you are online.',
        ),
      ],
    ),
  );
}

class CartPage extends ConsumerWidget {
  const CartPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => CustomerScaffold(
    selectedIndex: 3,
    title: 'Cart',
    body: FutureBuilder<Map<String, dynamic>?>(
      future: ref.read(apiProvider).one('/cart'),
      builder: (_, snapshot) {
        final data = snapshot.data;
        if (data == null)
          return const EmptyCard(
            message:
                'Sign in to view your cart. Your basket is safe while offline.',
          );
        final groups = (data['sellerGroups'] as List? ?? [])
            .whereType<Map>()
            .toList();
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'Subtotal ${((data['subtotal'] as Map?)?['display'] ?? '₹0')}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            for (final group in groups)
              Card(
                child: ExpansionTile(
                  title: Text('${group['sellerName'] ?? 'Seller'}'),
                  children: [
                    for (final item in (group['items'] as List? ?? const []))
                      ListTile(
                        title: Text('${item['title'] ?? 'Item'}'),
                        subtitle: Text('Qty ${item['quantity'] ?? 1}'),
                        trailing: Text(
                          '${((item['lineTotal'] as Map?)?['display'] ?? '₹0')}',
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: groups.isEmpty ? null : () => context.go('/orders'),
              child: const Text('Continue to checkout'),
            ),
          ],
        );
      },
    ),
  );
}

class OrdersPage extends ConsumerWidget {
  const OrdersPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => CustomerScaffold(
    title: 'Orders',
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: ref.read(apiProvider).list('/orders?limit=30'),
      builder: (_, snapshot) {
        final orders = snapshot.data ?? [];
        if (orders.isEmpty)
          return const EmptyCard(
            message:
                'Sign in to see order timeline, tracking, returns and refunds.',
          );
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            for (final order in orders)
              Card(
                child: ListTile(
                  title: Text('${order['orderNumber'] ?? 'Order'}'),
                  subtitle: Text(
                    '${order['status'] ?? 'PROCESSING'} · ${((order['totalPayable'] as Map?)?['display'] ?? '₹0')}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                ),
              ),
          ],
        );
      },
    ),
  );
}

class AccountPage extends StatelessWidget {
  const AccountPage({super.key});
  @override
  Widget build(BuildContext context) => CustomerScaffold(
    selectedIndex: 4,
    title: 'Account',
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Card(
          child: ListTile(
            leading: Icon(Icons.person_outline),
            title: Text('Profile & addresses'),
            subtitle: Text('Manage delivery details securely'),
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.favorite_border),
            title: const Text('Wishlist'),
            onTap: () {},
          ),
        ),
        const Card(
          child: ListTile(
            leading: Icon(Icons.security),
            title: Text('Privacy & security'),
            subtitle: Text('Export data or request account deletion'),
          ),
        ),
        const Card(
          child: ListTile(
            leading: Icon(Icons.support_agent),
            title: Text('Support'),
            subtitle: Text('Get help with an order'),
          ),
        ),
      ],
    ),
  );
}

class CustomerScaffold extends StatelessWidget {
  const CustomerScaffold({
    required this.body,
    this.title = 'NovaMart',
    this.selectedIndex = 0,
    this.onSearch,
    super.key,
  });
  final Widget body;
  final String title;
  final int selectedIndex;
  final VoidCallback? onSearch;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(title),
      actions: [
        IconButton(
          onPressed: onSearch ?? () => context.go('/search'),
          icon: const Icon(Icons.search),
        ),
        IconButton(
          onPressed: () => context.go('/cart'),
          icon: const Icon(Icons.shopping_bag_outlined),
        ),
      ],
    ),
    body: body,
    bottomNavigationBar: NavigationBar(
      selectedIndex: selectedIndex,
      onDestinationSelected: (index) {
        if (index == 0) context.go('/');
        if (index == 1) context.go('/categories');
        if (index == 2) context.go('/nova');
        if (index == 3) context.go('/cart');
        if (index == 4) context.go('/account');
      },
      destinations: const [
        NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
        NavigationDestination(icon: Icon(Icons.grid_view), label: 'Categories'),
        NavigationDestination(icon: Icon(Icons.auto_awesome), label: 'Nova'),
        NavigationDestination(
          icon: Icon(Icons.shopping_cart_outlined),
          label: 'Cart',
        ),
        NavigationDestination(
          icon: Icon(Icons.person_outline),
          label: 'Account',
        ),
      ],
    ),
  );
}

class ProductTile extends StatelessWidget {
  const ProductTile({required this.product, super.key});
  final Product product;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 190,
    child: Card(
      child: InkWell(
        onTap: () => context.go('/product/${product.slug}'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (product.imageUrl != null)
                Image.network(
                  product.imageUrl!,
                  height: 110,
                  width: double.infinity,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) =>
                      const Icon(Icons.image_not_supported_outlined),
                )
              else
                const SizedBox(height: 110),
              Text(product.title, maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 4),
              Text(
                product.price ?? '—',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class ProductListTile extends StatelessWidget {
  const ProductListTile({required this.product, super.key});
  final Product product;
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      onTap: () => context.go('/product/${product.slug}'),
      leading: product.imageUrl == null
          ? const Icon(Icons.shopping_bag_outlined)
          : Image.network(
              product.imageUrl!,
              width: 56,
              errorBuilder: (_, __, ___) =>
                  const Icon(Icons.image_not_supported_outlined),
            ),
      title: Text(product.title),
      subtitle: Text(product.price ?? 'Price unavailable'),
    ),
  );
}

class EmptyCard extends StatelessWidget {
  const EmptyCard({required this.message, super.key});
  final String message;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(padding: const EdgeInsets.all(20), child: Text(message)),
  );
}
