import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novamart_customer/main.dart';

class FakeApiClient extends ApiClient {
  @override
  Future<String> getHealth() async => 'ready';

  @override
  Future<List<Map<String, dynamic>>> list(String path) async =>
      <Map<String, dynamic>>[];
}

void main() {
  testWidgets('customer app renders navigation', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiProvider.overrideWithValue(FakeApiClient()),
          healthProvider.overrideWith((ref) => Future.value('ready')),
        ],
        child: const NovaMartCustomerApp(),
      ),
    );
    expect(find.text('NovaMart'), findsOneWidget);
    expect(find.text('Shop with confidence'), findsOneWidget);
  });
}
