import 'package:flutter_test/flutter_test.dart';
import 'package:novamart_warehouse/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
void main() { testWidgets('warehouse app renders work areas', (tester) async { await tester.pumpWidget(const ProviderScope(child: WarehouseApp())); expect(find.text('Warehouse operations'), findsOneWidget); expect(find.text('Picking'), findsOneWidget); }); }
