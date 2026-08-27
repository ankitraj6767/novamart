import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:4000/api/v1',
);
final apiProvider = Provider<DeliveryApi>((ref) => DeliveryApi());

class DeliveryApi {
  DeliveryApi()
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
}

void main() => runApp(const ProviderScope(child: DeliveryApp()));

class DeliveryApp extends StatelessWidget {
  const DeliveryApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'NovaMart Delivery',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff3b9a6d)),
      useMaterial3: true,
    ),
    routerConfig: GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const DeliveryHome()),
        GoRoute(path: '/deliveries', builder: (_, __) => const DeliveryQueue()),
        GoRoute(
          path: '/earnings',
          builder: (_, __) => const DeliveryEarnings(),
        ),
        GoRoute(path: '/support', builder: (_, __) => const DeliverySupport()),
      ],
    ),
  );
}

class DeliveryHome extends StatefulWidget {
  const DeliveryHome({super.key});
  @override
  State<DeliveryHome> createState() => _DeliveryHomeState();
}

class _DeliveryHomeState extends State<DeliveryHome> {
  bool available = true;
  @override
  Widget build(BuildContext context) => DeliveryScaffold(
    selectedIndex: 0,
    title: 'Delivery partner',
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Deliver with clarity',
          style: Theme.of(
            context,
          ).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'Assigned routes, OTP verification, proof of delivery and COD reconciliation.',
        ),
        const SizedBox(height: 24),
        Card(
          child: SwitchListTile(
            value: available,
            onChanged: (value) => setState(() => available = value),
            title: const Text('Available for assignments'),
            subtitle: Text(
              available
                  ? 'Operations can assign deliveries.'
                  : 'You are offline for new assignments.',
            ),
          ),
        ),
        const Card(
          child: ListTile(
            leading: Icon(Icons.route),
            title: Text('Today’s route'),
            subtitle: Text('No assignments yet'),
          ),
        ),
        const Card(
          child: ListTile(
            leading: Icon(Icons.account_balance_wallet_outlined),
            title: Text('COD reconciliation'),
            subtitle: Text(
              'Cash collected and remitted are reconciled in the backend.',
            ),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () => context.go('/deliveries'),
          icon: const Icon(Icons.refresh),
          label: const Text('Refresh assignments'),
        ),
      ],
    ),
  );
}

class DeliveryQueue extends ConsumerWidget {
  const DeliveryQueue({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => DeliveryScaffold(
    title: 'Assigned deliveries',
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: ref.read(apiProvider).shipments(),
      builder: (_, snapshot) {
        final rows = snapshot.data ?? [];
        if (rows.isEmpty)
          return const EmptyCard(
            message:
                'No assigned deliveries. Availability and assignments sync when you are online.',
          );
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            for (final row in rows)
              Card(
                child: ListTile(
                  title: Text('${row['shipment_reference'] ?? 'Shipment'}'),
                  subtitle: Text(
                    '${row['delivery_pincode'] ?? 'Pincode'} · AWB ${row['awb_number'] ?? 'Pending'}',
                  ),
                  trailing: Text('${row['status'] ?? 'CREATED'}'),
                ),
              ),
          ],
        );
      },
    ),
  );
}

class DeliveryEarnings extends StatelessWidget {
  const DeliveryEarnings({super.key});

  @override
  Widget build(BuildContext context) => DeliveryScaffold(
    selectedIndex: 2,
    title: 'Earnings',
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: const [
        Card(
          child: ListTile(
            title: Text('This period'),
            subtitle: Text(
              'Earnings appear after completed deliveries are reconciled.',
            ),
          ),
        ),
        Card(
          child: ListTile(
            title: Text('Cash collected'),
            subtitle: Text(
              'COD cash is tracked separately from digital earnings.',
            ),
          ),
        ),
      ],
    ),
  );
}

class DeliverySupport extends StatelessWidget {
  const DeliverySupport({super.key});

  @override
  Widget build(BuildContext context) => DeliveryScaffold(
    selectedIndex: 3,
    title: 'Support',
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: const [
        Card(
          child: ListTile(
            leading: Icon(Icons.support_agent),
            title: Text('Contact operations'),
            subtitle: Text(
              'Use a support ticket for route, customer or COD issues.',
            ),
          ),
        ),
        Card(
          child: ListTile(
            leading: Icon(Icons.verified_user_outlined),
            title: Text('Privacy-safe calling'),
            subtitle: Text(
              'Customer contact details remain masked by the platform.',
            ),
          ),
        ),
      ],
    ),
  );
}

class DeliveryScaffold extends StatelessWidget {
  const DeliveryScaffold({
    required this.body,
    this.title = 'Delivery partner',
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
          onPressed: () => context.go('/support'),
          icon: const Icon(Icons.support_agent),
        ),
      ],
    ),
    body: body,
    bottomNavigationBar: NavigationBar(
      selectedIndex: selectedIndex,
      onDestinationSelected: (index) {
        if (index == 0) context.go('/');
        if (index == 1) context.go('/deliveries');
        if (index == 2) context.go('/earnings');
        if (index == 3) context.go('/support');
      },
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.dashboard_outlined),
          label: 'Home',
        ),
        NavigationDestination(icon: Icon(Icons.route), label: 'Deliveries'),
        NavigationDestination(
          icon: Icon(Icons.payments_outlined),
          label: 'Earnings',
        ),
        NavigationDestination(
          icon: Icon(Icons.support_agent),
          label: 'Support',
        ),
      ],
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
