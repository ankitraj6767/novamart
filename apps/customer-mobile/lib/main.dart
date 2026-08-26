import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:4000/api/v1');

final apiProvider = Provider<ApiClient>((ref) => ApiClient());
final healthProvider = FutureProvider.autoDispose<String>((ref) async => ref.read(apiProvider).getHealth());

class ApiClient {
  final Dio dio = Dio(BaseOptions(baseUrl: apiBaseUrl, connectTimeout: const Duration(seconds: 8), receiveTimeout: const Duration(seconds: 12)));
  Future<String> getHealth() async { try { final response = await dio.get('/health/ready'); return (response.data['status'] as String?) ?? 'unknown'; } catch (_) { return 'offline'; } }
}

void main() => runApp(const ProviderScope(child: NovaMartCustomerApp()));

class NovaMartCustomerApp extends StatelessWidget {
  const NovaMartCustomerApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'NovaMart',
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff0d7773)), useMaterial3: true),
    routerConfig: GoRouter(routes: [GoRoute(path: '/', builder: (_, __) => const CustomerHome()), GoRoute(path: '/categories', builder: (_, __) => const PlaceholderPage(title: 'Categories')), GoRoute(path: '/cart', builder: (_, __) => const PlaceholderPage(title: 'Cart')), GoRoute(path: '/account', builder: (_, __) => const PlaceholderPage(title: 'Account'))]),
  );
}

class CustomerHome extends ConsumerWidget {
  const CustomerHome({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('NovaMart'), actions: [IconButton(onPressed: () => context.go('/cart'), icon: const Icon(Icons.shopping_bag_outlined))]),
    body: ListView(padding: const EdgeInsets.all(20), children: [
      Text('Shop with confidence', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: 8), const Text('Verified sellers, authoritative prices and delivery you can follow.'),
      const SizedBox(height: 20),
      Card(color: Theme.of(context).colorScheme.primaryContainer, child: const Padding(padding: EdgeInsets.all(20), child: Text('Dynamic homepage sections, search, cart and checkout are served by the NovaMart API.'))),
      const SizedBox(height: 20),
      ref.watch(healthProvider).when(data: (status) => ListTile(leading: Icon(status == 'ready' ? Icons.check_circle : Icons.cloud_off), title: const Text('Service status'), subtitle: Text(status)), loading: () => const LinearProgressIndicator(), error: (_, __) => const ListTile(title: Text('Service unavailable'))),
      const SizedBox(height: 12),
      FilledButton.icon(onPressed: () => context.go('/categories'), icon: const Icon(Icons.grid_view), label: const Text('Browse categories')),
    ]),
    bottomNavigationBar: NavigationBar(selectedIndex: 0, onDestinationSelected: (index) { if (index == 1) context.go('/categories'); if (index == 3) context.go('/cart'); if (index == 4) context.go('/account'); }, destinations: const [NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'), NavigationDestination(icon: Icon(Icons.grid_view), label: 'Categories'), NavigationDestination(icon: Icon(Icons.auto_awesome), label: 'Nova'), NavigationDestination(icon: Icon(Icons.shopping_cart_outlined), label: 'Cart'), NavigationDestination(icon: Icon(Icons.person_outline), label: 'Account')]),
  );
}

class PlaceholderPage extends StatelessWidget { final String title; const PlaceholderPage({required this.title, super.key}); @override Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(title)), body: Center(child: Text('$title connects to the live NovaMart API.'))); }
