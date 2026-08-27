import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:4000/api/v1',
);
const sellerId = String.fromEnvironment('SELLER_ID', defaultValue: '');
final apiProvider = Provider<ApiClient>((ref) => ApiClient());

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

  Future<String> status() async {
    try {
      final response = await dio.get('/health/ready');
      return response.data['status'] as String? ?? 'unknown';
    } catch (_) {
      return 'offline';
    }
  }

  Future<List<Map<String, dynamic>>> list(String path) async {
    try {
      final response = await dio.get(path);
      final data = (response.data as Map?)?['data'];
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
    } catch (_) {}
    return <Map<String, dynamic>>[];
  }

  Future<Map<String, dynamic>> one(String path) async {
    try {
      final response = await dio.get(path);
      final data = (response.data as Map?)?['data'];
      return data is Map
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
  }
}

void main() => runApp(const ProviderScope(child: SellerApp()));

class SellerApp extends StatelessWidget {
  const SellerApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'NovaMart Seller',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff0d7773)),
      useMaterial3: true,
    ),
    routerConfig: GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const SellerHome()),
        GoRoute(path: '/orders', builder: (_, __) => const SellerOrders()),
        GoRoute(
          path: '/inventory',
          builder: (_, __) => const SellerInventory(),
        ),
        GoRoute(path: '/returns', builder: (_, __) => const SellerReturns()),
        GoRoute(path: '/finance', builder: (_, __) => const SellerFinance()),
        GoRoute(path: '/account', builder: (_, __) => const SellerAccount()),
      ],
    ),
  );
}

class SellerHome extends ConsumerWidget {
  const SellerHome({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => SellerScaffold(
    title: 'Seller Center',
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Operate your store',
          style: Theme.of(
            context,
          ).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'Orders, inventory, listings and settlements in one mobile workspace.',
        ),
        const SizedBox(height: 24),
        const Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            Metric(title: 'Orders', value: 'Live'),
            Metric(title: 'Stock alerts', value: 'Review'),
            Metric(title: 'Settlements', value: 'Tracked'),
            Metric(title: 'Rating', value: '—'),
          ],
        ),
        const SizedBox(height: 24),
        Card(
          child: ListTile(
            leading: const Icon(Icons.sync),
            title: const Text('API connection'),
            subtitle: FutureBuilder<String>(
              future: ref.read(apiProvider).status(),
              builder: (_, snapshot) => Text(snapshot.data ?? 'Checking…'),
            ),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () => context.go('/orders'),
          icon: const Icon(Icons.receipt_long),
          label: const Text('Open order queue'),
        ),
      ],
    ),
  );
}

class SellerOrders extends ConsumerWidget {
  const SellerOrders({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => SellerScaffold(
    title: 'Orders',
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: ref.read(apiProvider).list('/sellers/$sellerId/orders?limit=50'),
      builder: (_, snapshot) {
        final rows = snapshot.data ?? [];
        if (rows.isEmpty)
          return const EmptyCard(
            message:
                'No orders yet. New orders appear here with their dispatch SLA.',
          );
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            for (final row in rows)
              Card(
                child: ListTile(
                  title: Text('${row['order_number'] ?? 'Order'}'),
                  subtitle: Text(
                    '${row['product_title'] ?? 'Item'} · Qty ${row['quantity'] ?? 0}',
                  ),
                  trailing: Text('${row['status'] ?? '—'}'),
                ),
              ),
          ],
        );
      },
    ),
  );
}

class SellerInventory extends ConsumerWidget {
  const SellerInventory({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => SellerScaffold(
    title: 'Inventory',
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: ref
          .read(apiProvider)
          .list('/inventory/sellers/$sellerId?limit=100'),
      builder: (_, snapshot) {
        final rows = snapshot.data ?? [];
        if (rows.isEmpty)
          return const EmptyCard(
            message:
                'No inventory records. Receive stock against an approved listing.',
          );
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            for (final row in rows)
              Card(
                child: ListTile(
                  title: Text('${row['sku_code'] ?? 'SKU'}'),
                  subtitle: Text(
                    '${row['warehouse_name'] ?? 'Warehouse'} · Available ${row['available_quantity'] ?? 0}',
                  ),
                  trailing: Text('Reserved ${row['reserved_quantity'] ?? 0}'),
                ),
              ),
          ],
        );
      },
    ),
  );
}

class SellerReturns extends ConsumerWidget {
  const SellerReturns({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => SellerScaffold(
    title: 'Returns',
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: ref.read(apiProvider).list('/sellers/$sellerId/returns'),
      builder: (_, snapshot) {
        final rows = snapshot.data ?? [];
        if (rows.isEmpty)
          return const EmptyCard(
            message: 'No return requests in your seller scope.',
          );
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            for (final row in rows)
              Card(
                child: ListTile(
                  title: Text('${row['return_reference'] ?? 'Return'}'),
                  subtitle: Text(
                    '${row['reason_code'] ?? 'Reason'} · ${row['resolution_requested'] ?? 'Review'}',
                  ),
                  trailing: Text('${row['status'] ?? '—'}'),
                ),
              ),
          ],
        );
      },
    ),
  );
}

class SellerFinance extends ConsumerWidget {
  const SellerFinance({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => SellerScaffold(
    title: 'Finance',
    body: FutureBuilder<Map<String, dynamic>>(
      future: ref.read(apiProvider).one('/seller-finance/$sellerId/balance'),
      builder: (_, snapshot) {
        final data = snapshot.data ?? {};
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'Settlement overview',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            Card(
              child: ListTile(
                title: const Text('Net balance'),
                subtitle: Text('${data['net_balance_paise'] ?? 0} paise'),
              ),
            ),
            Card(
              child: ListTile(
                title: const Text('Settleable now'),
                subtitle: Text('${data['settleable_now_paise'] ?? 0} paise'),
              ),
            ),
            const SizedBox(height: 16),
            const EmptyCard(
              message:
                  'Every credit, fee and payout is backed by the immutable seller ledger.',
            ),
          ],
        );
      },
    ),
  );
}

class SellerAccount extends StatelessWidget {
  const SellerAccount({super.key});

  @override
  Widget build(BuildContext context) => SellerScaffold(
    selectedIndex: 4,
    title: 'Account',
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: const [
        Card(
          child: ListTile(
            leading: Icon(Icons.business),
            title: Text('Business details'),
            subtitle: Text('GST, PAN, bank and pickup locations'),
          ),
        ),
        Card(
          child: ListTile(
            leading: Icon(Icons.people_outline),
            title: Text('Users & roles'),
            subtitle: Text('Seller-scoped access'),
          ),
        ),
        Card(
          child: ListTile(
            leading: Icon(Icons.support_agent),
            title: Text('Support'),
            subtitle: Text('Open a seller support case'),
          ),
        ),
      ],
    ),
  );
}

class SellerScaffold extends StatelessWidget {
  const SellerScaffold({
    required this.body,
    this.title = 'Seller Center',
    this.selectedIndex = 0,
    super.key,
  });
  final Widget body;
  final String title;
  final int selectedIndex;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(title),
      actions: [
        IconButton(
          onPressed: () {},
          icon: const Icon(Icons.notifications_none),
        ),
      ],
    ),
    body: body,
    bottomNavigationBar: NavigationBar(
      selectedIndex: selectedIndex,
      onDestinationSelected: (index) {
        if (index == 0) context.go('/');
        if (index == 1) context.go('/orders');
        if (index == 2) context.go('/inventory');
        if (index == 3) context.go('/finance');
        if (index == 4) context.go('/account');
      },
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.dashboard_outlined),
          label: 'Overview',
        ),
        NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Orders'),
        NavigationDestination(
          icon: Icon(Icons.inventory_2_outlined),
          label: 'Stock',
        ),
        NavigationDestination(
          icon: Icon(Icons.account_balance_wallet_outlined),
          label: 'Finance',
        ),
        NavigationDestination(
          icon: Icon(Icons.person_outline),
          label: 'Account',
        ),
      ],
    ),
  );
}

class Metric extends StatelessWidget {
  const Metric({required this.title, required this.value, super.key});
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 150,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title),
            const SizedBox(height: 8),
            Text(
              value,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
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
