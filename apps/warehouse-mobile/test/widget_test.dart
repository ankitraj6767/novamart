import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novamart_warehouse/main.dart';

class FakeWarehouseApi extends WarehouseApi {
  @override
  Future<List<Map<String, dynamic>>> shipments() async =>
      <Map<String, dynamic>>[];

  @override
  Future<List<Map<String, dynamic>>> inventory() async =>
      <Map<String, dynamic>>[];
}

void main() {
  testWidgets('warehouse app renders work areas', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiProvider.overrideWithValue(FakeWarehouseApi())],
        child: const WarehouseApp(),
      ),
    );
    expect(find.text('Warehouse operations'), findsOneWidget);
    expect(find.text('Picking'), findsNWidgets(2));
  });
}
