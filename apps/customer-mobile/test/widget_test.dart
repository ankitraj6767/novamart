import 'package:flutter_test/flutter_test.dart';
import 'package:novamart_customer/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() { testWidgets('customer app renders navigation', (tester) async { await tester.pumpWidget(ProviderScope(overrides: [healthProvider.overrideWith((ref) => Future.value('ready'))], child: const NovaMartCustomerApp())); expect(find.text('NovaMart'), findsOneWidget); expect(find.text('Shop with confidence'), findsOneWidget); }); }
