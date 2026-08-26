import 'package:flutter_test/flutter_test.dart';
import 'package:novamart_delivery/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
void main() { testWidgets('delivery app renders availability', (tester) async { await tester.pumpWidget(const ProviderScope(child: DeliveryApp())); expect(find.text('Delivery partner'), findsOneWidget); expect(find.text('Available for assignments'), findsOneWidget); }); }
