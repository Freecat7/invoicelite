-- Ein Zähler von 0 oder weniger ist kein gültiger Stand. Solche Werte
-- entstanden, als ein geleertes Eingabefeld still als 0 gespeichert wurde:
-- der nächste Lauf erzeugte noch einen Beleg, zählte auf -1 und setzte die
-- Vorlage auf "beendet". Leer bedeutet unbegrenzt, also wird daraus NULL.
--
-- Der Status bleibt unberührt. Eine dadurch beendete Vorlage läuft erst
-- weiter, wenn sie wieder auf "aktiv" gestellt wird; das genügt dann aber,
-- weil im Feld kein Wert mehr steht, der sie sofort erneut beenden würde.
UPDATE "RecurringInvoice" SET "remainingCycles" = NULL WHERE "remainingCycles" <= 0;
UPDATE "RecurringExpense" SET "remainingCycles" = NULL WHERE "remainingCycles" <= 0;
