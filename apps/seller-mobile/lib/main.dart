import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:4000/api/v1');
final apiProvider = Provider<ApiClient>((ref) => ApiClient());

void main() => runApp(const ProviderScope(child: SellerApp()));

class ApiClient {
  final Dio dio = Dio(BaseOptions(baseUrl: apiBaseUrl));
  Future<String> status() async {
    try {
      final response = await dio.get('/health/ready');
      return response.data['status'] as String? ?? 'unknown';
    } catch (_) {
      return 'offline';
    }
  }
}

class SellerApp extends StatelessWidget {
  const SellerApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'NovaMart Seller',
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff0d7773)), useMaterial3: true),
        routerConfig: GoRouter(routes: [GoRoute(path: '/', builder: (_, __) => const SellerHome())]),
      );
}

class SellerHome extends ConsumerWidget {
  const SellerHome({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        appBar: AppBar(title: const Text('Seller Center'), actions: [IconButton(onPressed: () {}, icon: const Icon(Icons.notifications_none))]),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text('Operate your store', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            const Text('Orders, inventory, listings and settlements in one mobile workspace.'),
            const SizedBox(height: 24),
            const Wrap(spacing: 12, runSpacing: 12, children: [Metric(title: 'Orders', value: 'Live'), Metric(title: 'Stock alerts', value: 'Review'), Metric(title: 'Settlements', value: 'Tracked'), Metric(title: 'Rating', value: '—')]),
            const SizedBox(height: 24),
            Card(child: ListTile(leading: const Icon(Icons.sync), title: const Text('API connection'), subtitle: FutureBuilder<String>(future: ref.read(apiProvider).status(), builder: (_, snapshot) => Text(snapshot.data ?? 'Checking…')))),
            const SizedBox(height: 12),
            FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.receipt_long), label: const Text('Open order queue')),
          ],
        ),
      );
}

class Metric extends StatelessWidget {
  final String title;
  final String value;
  const Metric({required this.title, required this.value, super.key});
  @override
  Widget build(BuildContext context) => SizedBox(
        width: 150,
        child: Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title), const SizedBox(height: 8), Text(value, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold))]))),
      );
}
