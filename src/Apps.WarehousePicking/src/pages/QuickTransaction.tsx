import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { ItemPicker } from "@/components/mobile/ItemPicker";
import { ItemSummary } from "@/components/mobile/ItemSummary";
import { MobilePage } from "@/components/mobile/MobilePage";
import { QuantityStepper } from "@/components/mobile/QuantityStepper";
import { ResultPanel } from "@/components/mobile/ResultPanel";
import { Lab_warehouseitemsService } from "@/generated/services/Lab_warehouseitemsService";
import { usePickItems, PICK_ITEMS_KEY, type PickItem } from "@/hooks/UsePickItems";
import type { Lab_warehouseitems } from "@/generated/models/Lab_warehouseitemsModel";
import { serviceResult } from "@/utils/ServicePayload";
import { errorText, useStockTransaction } from "@/utils/StockTransactions";
import { useStyles } from "@/styles/QuickTransaction.styles";

type Mode = "receive" | "pick";

const CONFIG = {
  receive: { title: "Receive stock", verb: "Receive", past: "Received", type: "inbound" },
  pick: { title: "Pick stock", verb: "Pick", past: "Picked", type: "outbound" },
} as const;

// Receive and Pick are the same flow in opposite directions: choose an item, set a quantity, confirm.
// The server keeps the item's quantity in step (and refuses a pick of more than is on hand).
function QuickTransactionFlow({ mode }: { mode: Mode }) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  usePickItems();
  const config = CONFIG[mode];
  const stock = useStockTransaction();
  const [item, setItem] = useState<PickItem | null>(null);
  const [quantity, setQuantity] = useState<number | null>(1);
  const [result, setResult] = useState<{ title: string; detail: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const restart = () => {
    setItem(null);
    setQuantity(1);
    setResult(null);
    setErrorMessage(null);
    stock.reset();
  };

  if (result) {
    return (
      <MobilePage title={config.title}>
        <ResultPanel title={result.title} detail={result.detail} onAgain={restart} />
        {errorMessage && (
          <MessageBar intent="error">
            <MessageBarBody>{errorMessage}</MessageBarBody>
          </MessageBar>
        )}
      </MobilePage>
    );
  }

  if (!item) {
    return (
      <MobilePage title={config.title}>
        <ItemPicker onSelect={setItem} />
      </MobilePage>
    );
  }

  const valid = quantity !== null;

  const confirm = async () => {
    if (!valid) return;
    setErrorMessage(null);
    try {
      await stock.mutateAsync({
        itemId: item.id,
        itemName: item.name,
        type: config.type,
        quantity,
        label: config.verb,
      });
      setResult({
        title: `${config.past} ${quantity}`,
        detail: `${item.name} - Transaction saved`,
      });
      try {
        const refreshedItem = await serviceResult(Lab_warehouseitemsService.get(item.id));
        queryClient.setQueryData<Lab_warehouseitems[]>(PICK_ITEMS_KEY, (items) =>
          items?.map((record) =>
            record.lab_warehouseitemid === item.id ? refreshedItem.data : record
          )
        );
        setResult({
          title: `${config.past} ${quantity}`,
          detail: `${item.name} - ${Number(refreshedItem.data.lab_availablequantity)} on hand now`,
        });
      } catch (error) {
        setErrorMessage(errorText(error));
      }
    } catch (error) {
      setErrorMessage(errorText(error));
    }
  };

  return (
    <MobilePage
      title={config.title}
      footer={
        <Button
          className={styles.confirm}
          appearance="primary"
          size="large"
          disabled={!valid || stock.isPending}
          onClick={() => void confirm()}
          data-testid="flow-confirm"
        >
          {stock.isPending ? "Saving..." : valid ? `${config.verb} ${quantity}` : config.verb}
        </Button>
      }
    >
      <ItemSummary item={item} onChange={restart} />
      <QuantityStepper
        id="quick-quantity"
        label="Quantity"
        value={quantity}
        onChange={setQuantity}
        hint={quantity === null ? "Enter how many" : undefined}
      />
      {errorMessage && (
        <MessageBar intent="error">
          <MessageBarBody>{errorMessage}</MessageBarBody>
        </MessageBar>
      )}
    </MobilePage>
  );
}

// Keyed by mode so switching between /receive and /pick never carries an item or quantity over
export default function QuickTransactionPage({ mode }: { mode: Mode }) {
  return <QuickTransactionFlow key={mode} mode={mode} />;
}
