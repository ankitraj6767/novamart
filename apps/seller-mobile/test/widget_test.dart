import 'package:flutter_test/flutter_test.dart';
import 'package:novamart_seller/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class FakeApiClient extends ApiClient {
  @override
  Future<String> status() async => 'ready';

  @override
  Future<List<Map<String, dynamic>>> list(String path) async =>
      <Map<String, dynamic>>[];
}

void main() {
  testWidgets('seller app renders dashboard', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiProvider.overrideWithValue(FakeApiClient())],
        child: const SellerApp(),
      ),
    );
    expect(find.text('Seller Center'), findsOneWidget);
    expect(find.text('Operate your store'), findsOneWidget);
  });
}
