import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:4000/api/v1',
);
const warehouseId = String.fromEnvironment('WAREHOUSE_ID', defaultValue: '');
final apiProvider = Provider<WarehouseApi>((ref) => WarehouseApi());

class WarehouseApi {
  WarehouseApi()
    : dio = Dio(
        BaseOptions(
          baseUrl: apiBaseUrl,
          connectTimeout: const Duration(seconds: 8),
          receiveTimeout: const Duration(seconds: 12),
        ),
      );
  final Dio dio;
  Future<List<Map<String, dynamic>>> shipments() async {
    try {
      final response = await dio.get('/shipping/shipments?limit=50');
      final data = (response.data as Map?)?['data'];
      if (data is List)
        return data
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
    } catch (_) {}
    return <Map<String, dynamic>>[];
  }

  Future<List<Map<String, dynamic>>> inventory() async {
    try {
      final response = await dio.get('/admin/inventory?limit=100');
      final data = (response.data as Map?)?['data'];
      if (data is List)
        return data
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
    } catch (_) {}
    return <Map<String, dynamic>>[];
  }
}

void main() => runApp(const ProviderScope(child: WarehouseApp()));

class WarehouseApp extends StatelessWidget {
  const WarehouseApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'NovaMart Warehouse',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff6b58b5)),
      useMaterial3: true,
    ),
    routerConfig: GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const WarehouseHome()),
        GoRoute(
          path: '/inbound',
          builder: (_, __) => const WarehouseWorkPage(
            title: 'Inbound inventory',
            icon: Icons.download,
          ),
        ),
        GoRoute(
          path: '/picking',
          builder: (_, __) => const WarehouseWorkPage(
            title: 'Picking',
            icon: Icons.shopping_basket_outlined,
          ),
        ),
        GoRoute(
          path: '/packing',
          builder: (_, __) => const WarehouseWorkPage(
            title: 'Packing',
            icon: Icons.inventory_2_outlined,
          ),
        ),
        GoRoute(
          path: '/qc',
          builder: (_, __) => const WarehouseWorkPage(
            title: 'Quality check',
            icon: Icons.verified_outlined,
          ),
        ),
        GoRoute(
          path: '/dispatch',
          builder: (_, __) => const WarehouseWorkPage(
            title: 'Dispatch',
            icon: Icons.local_shipping_outlined,
          ),
        ),
        GoRoute(
          path: '/returns',
          builder: (_, __) => const WarehouseWorkPage(
            title: 'Returns inspection',
            icon: Icons.assignment_return_outlined,
          ),
        ),
        GoRoute(
          path: '/count',
          builder: (_, __) => const WarehouseWorkPage(
            title: 'Cycle count',
            icon: Icons.fact_check_outlined,
          ),
        ),
      ],
    ),
  );
}

class WarehouseHome extends ConsumerWidget {
  const WarehouseHome({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => WarehouseScaffold(
    title: 'Warehouse operations',
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Move stock precisely',
          style: Theme.of(
            context,
          ).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'Inbound, picking, packing, QC, dispatch, returns and cycle counts.',
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            WarehouseAction(
              icon: Icons.download,
              title: 'Inbound',
              route: '/inbound',
            ),
            WarehouseAction(
              icon: Icons.shopping_basket_outlined,
              title: 'Picking',
              route: '/picking',
            ),
            WarehouseAction(
              icon: Icons.inventory_2_outlined,
              title: 'Packing',
              route: '/packing',
            ),
            WarehouseAction(
              icon: Icons.verified_outlined,
              title: 'QC',
              route: '/qc',
            ),
            WarehouseAction(
              icon: Icons.local_shipping_outlined,
              title: 'Dispatch',
              route: '/dispatch',
            ),
            WarehouseAction(
              icon: Icons.assignment_return_outlined,
              title: 'Returns',
              route: '/returns',
            ),
            WarehouseAction(
              icon: Icons.fact_check_outlined,
              title: 'Cycle count',
              route: '/count',
            ),
          ],
        ),
        const SizedBox(height: 24),
        FutureBuilder<List<Map<String, dynamic>>>(
          future: ref.read(apiProvider).inventory(),
          builder: (_, snapshot) => Card(
            child: ListTile(
              leading: const Icon(Icons.inventory),
              title: const Text('Inventory queue'),
              subtitle: Text(
                snapshot.connectionState == ConnectionState.waiting
                    ? 'Synchronising…'
                    : '${snapshot.data?.length ?? 0} records visible',
              ),
            ),
          ),
        ),
        const Card(
          child: ListTile(
            leading: Icon(Icons.security),
            title: Text('Every adjustment is maker-checker'),
            subtitle: Text(
              'Stock changes use the transaction-safe inventory ledger.',
            ),
          ),
        ),
      ],
    ),
  );
}

class WarehouseWorkPage extends ConsumerWidget {
  const WarehouseWorkPage({required this.title, required this.icon, super.key});
  final String title;
  final IconData icon;
  @override
  Widget build(BuildContext context, WidgetRef ref) => WarehouseScaffold(
    title: title,
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: ref.read(apiProvider).shipments(),
      builder: (_, snapshot) {
        final rows = snapshot.data ?? [];
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              child: ListTile(
                leading: Icon(icon, size: 32),
                title: Text(title),
                subtitle: Text(
                  warehouseId.isEmpty
                      ? 'Configure WAREHOUSE_ID for a scoped queue.'
                      : 'Warehouse ${warehouseId.substring(0, 8)}',
                ),
              ),
            ),
            if (rows.isEmpty)
              const EmptyCard(
                message:
                    'No work items are currently assigned. Refresh when connectivity returns.',
              )
            else
              for (final row in rows)
                Card(
                  child: ListTile(
                    title: Text('${row['shipment_reference'] ?? 'Work item'}'),
                    subtitle: Text(
                      '${row['status'] ?? 'CREATED'} · ${row['delivery_pincode'] ?? '—'}',
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

class WarehouseScaffold extends StatelessWidget {
  const WarehouseScaffold({
    required this.body,
    this.title = 'Warehouse operations',
    super.key,
  });
  final Widget body;
  final String title;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(title),
      actions: [
        IconButton(onPressed: () {}, icon: const Icon(Icons.qr_code_scanner)),
      ],
    ),
    body: body,
    bottomNavigationBar: NavigationBar(
      selectedIndex: 0,
      onDestinationSelected: (index) {
        if (index == 0) context.go('/');
        if (index == 1) context.go('/picking');
        if (index == 2) context.go('/dispatch');
        if (index == 3) context.go('/returns');
      },
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.dashboard_outlined),
          label: 'Work',
        ),
        NavigationDestination(
          icon: Icon(Icons.shopping_basket_outlined),
          label: 'Picking',
        ),
        NavigationDestination(
          icon: Icon(Icons.local_shipping_outlined),
          label: 'Dispatch',
        ),
        NavigationDestination(
          icon: Icon(Icons.assignment_return_outlined),
          label: 'Returns',
        ),
      ],
    ),
  );
}

class WarehouseAction extends StatelessWidget {
  const WarehouseAction({
    required this.icon,
    required this.title,
    required this.route,
    super.key,
  });
  final IconData icon;
  final String title;
  final String route;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 150,
    child: Card(
      child: InkWell(
        onTap: () => context.go(route),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Icon(icon, size: 30),
              const SizedBox(height: 8),
              Text(title),
            ],
          ),
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
