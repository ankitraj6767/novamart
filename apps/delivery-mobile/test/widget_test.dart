import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novamart_delivery/main.dart';

class FakeDeliveryApi extends DeliveryApi {
  @override
  Future<List<Map<String, dynamic>>> shipments() async =>
      <Map<String, dynamic>>[];
}

void main() {
  testWidgets('delivery app renders availability', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiProvider.overrideWithValue(FakeDeliveryApi())],
        child: const DeliveryApp(),
      ),
    );
    expect(find.text('Delivery partner'), findsOneWidget);
    expect(find.text('Available for assignments'), findsOneWidget);
  });
}
