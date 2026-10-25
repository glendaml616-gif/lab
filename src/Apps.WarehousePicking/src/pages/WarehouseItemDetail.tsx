import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Lab_warehouseitemsService } from "@/generated/services/Lab_warehouseitemsService";
import { Lab_warehousetransactionsService } from "@/generated/services/Lab_warehousetransactionsService";
import { Lab_warehouselocationsService } from "@/generated/services/Lab_warehouselocationsService";
import { Lab_productsService } from "@/generated/services/Lab_productsService";
import { OpenFoodFactsService } from "@/generated/services/OpenFoodFactsService";
import type { Lab_warehousetransactions } from "@/generated/models/Lab_warehousetransactionsModel";
import type { Lab_warehouselocations } from "@/generated/models/Lab_warehouselocationsModel";
import type { Product } from "@/generated/models/OpenFoodFactsModel";
import type { Lab_products } from "@/generated/models/Lab_productsModel";
import { categoryOptionMetadata, statusOptions, transactionTypeOptionMetadata } from "@/utils/OptionSets";
import {
  Body1,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Skeleton,
  SkeletonItem,
  Text,
} from "@fluentui/react-components";
import { ArrowLeftRegular, CameraRegular, SearchRegular } from "@fluentui/react-icons";
import type { IColumn } from "@talxis/client-libraries";
import { RecordDetailForm } from "@/components/RecordDetailForm";
import { RecordFormDialog } from "@/components/RecordFormDialog";
import type { FormField } from "@/components/RecordFormFields";
import { RecordGrid } from "@/components/RecordGrid";
import { useToast } from "@/hooks/use-toast";
import { useStyles } from "@/styles/WarehouseItemDetail.styles";
import { servicePayload, serviceResult } from "@/utils/ServicePayload";
import { errorText } from "@/utils/StockTransactions";
import { toNumber } from "@/utils/RecordValues";

const transactionColumns: IColumn[] = [
  { name: "lab_name", displayName: "Name", dataType: "SingleLine.Text", isPrimary: true, visualSizeFactor: 240 },
  { name: "lab_quantity", displayName: "Quantity", dataType: "Whole.None", visualSizeFactor: 110 },
  {
    name: "lab_transactiontype",
    displayName: "Type",
    dataType: "OptionSet",
    visualSizeFactor: 130,
    metadata: { OptionSet: transactionTypeOptionMetadata } as IColumn["metadata"],
  },
  { name: "lab_transactiondate", displayName: "Date", dataType: "DateAndTime.DateAndTime", visualSizeFactor: 120 },
];

// The New Transaction form for this item (the item itself is bound on create): name, quantity of at
// least 1 - the direction comes from the type - and type are all required.
const formFields: FormField[] = [
  { column: { name: "lab_name", displayName: "Transaction Name", dataType: "SingleLine.Text", isPrimary: true }, required: true },
  { column: { name: "lab_quantity", displayName: "Quantity", dataType: "Whole.None" }, required: true },
  { column: { name: "lab_transactiontype", displayName: "Transaction Type", dataType: "OptionSet", metadata: { OptionSet: transactionTypeOptionMetadata } as IColumn["metadata"] }, required: true },
];

// The item's detail form: name, SKU and category are required; the quantity is shown but not
// editable (only transactions change it, so the ledger and the quantity can't drift), and so is the
// status. The location holds the picked location's id (RecordLookup).
const itemFields: FormField[] = [
  { column: { name: "lab_name", displayName: "Name", dataType: "SingleLine.Text", isPrimary: true }, required: true },
  { column: { name: "lab_sku", displayName: "SKU", dataType: "SingleLine.Text" }, required: true },
  { column: { name: "lab_availablequantity", displayName: "Available Quantity", dataType: "Whole.None" }, disabled: true, testId: "item-detail-qty" },
  { column: { name: "lab_category", displayName: "Category", dataType: "OptionSet", metadata: { OptionSet: categoryOptionMetadata } as IColumn["metadata"] }, required: true },
  { column: { name: "lab_locationid", displayName: "Location", dataType: "SingleLine.Text" }, lookupEntity: "lab_warehouselocation" },
  { column: { name: "lab_productid", displayName: "Product", dataType: "SingleLine.Text" }, lookupEntity: "lab_product" },
  { column: { name: "statecode", displayName: "Status", dataType: "OptionSet", metadata: { OptionSet: statusOptions } as IColumn["metadata"] }, disabled: true },
];

const toBlob = (value: unknown): Blob | null => {
  if (value instanceof Blob) return value;
  if (value instanceof ArrayBuffer) return new Blob([value]);
  if (typeof value === "string") {
    try {
      const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0));
      return new Blob([bytes]);
    } catch {
      return null;
    }
  }
  return null;
};

export default function WarehouseItemDetailPage() {
  const styles = useStyles();
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodePreview, setBarcodePreview] = useState<Product | null>(null);
  const [barcodePreviewImage, setBarcodePreviewImage] = useState<string | undefined>();
  const [barcodeMessage, setBarcodeMessage] = useState<string | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeLinking, setBarcodeLinking] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const { data: item, isLoading: itemLoading } = useQuery({
    queryKey: ["warehouseItem", id],
    queryFn: async () => {
      const result = await serviceResult(Lab_warehouseitemsService.get(id!));
      return result.data;
    },
    enabled: !!id,
  });

  const { data: linkedProduct } = useQuery({
    queryKey: ["linkedProduct", item?._lab_productid_value],
    queryFn: async () => {
      if (!item?._lab_productid_value) return null;
      const result = await serviceResult(Lab_productsService.get(item._lab_productid_value));
      return result.data;
    },
    enabled: !!item?._lab_productid_value,
  });

  const { data: transactions } = useQuery({
    queryKey: ["itemTransactions", id],
    queryFn: async () => {
      const result = await serviceResult(Lab_warehousetransactionsService.getAll({
        select: [
          "lab_warehousetransactionid",
          "lab_name",
          "lab_quantity",
          "lab_transactiontype",
          "lab_transactiondate",
        ],
        filter: `_lab_itemid_value eq '${id}'`,
        orderBy: ["lab_transactiondate desc"],
      }));
      return result.data ?? [];
    },
    enabled: !!id,
  });

  const { data: locations } = useQuery({
    queryKey: ["warehouseLocations"],
    queryFn: async () => {
      const result = await serviceResult(Lab_warehouselocationsService.getAll({
        select: ["lab_warehouselocationid", "lab_name"],
        orderBy: ["lab_name asc"],
      }));
      return result.data ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const result = await serviceResult(Lab_productsService.getAll({
        select: ["lab_productid", "lab_name"],
        orderBy: ["lab_name asc"],
      }));
      return result.data ?? [];
    },
  });

  const transactionRows = useMemo(
    () =>
      transactions?.map((tx: Lab_warehousetransactions) => ({
        ...tx,
        lab_quantity: toNumber(tx.lab_quantity),
        lab_transactiontype: toNumber(tx.lab_transactiontype),
      })),
    [transactions]
  );

  const locationRecords = useMemo(
    () =>
      (locations ?? []).map((loc: Lab_warehouselocations) => ({
        id: loc.lab_warehouselocationid,
        name: loc.lab_name ?? "",
      })),
    [locations]
  );

  const productRecords = useMemo(
    () =>
      (products ?? []).map((product: Lab_products) => ({
        id: product.lab_productid,
        name: product.lab_name ?? "",
      })),
    [products]
  );

  const fetchProductImage = useCallback(async (imageUrl: string): Promise<string | undefined> => {
    try {
      const result = await serviceResult(OpenFoodFactsService.GetProductImage(imageUrl));
      const blob = toBlob(result.data);
      if (!blob) return undefined;
      return URL.createObjectURL(blob);
    } catch {
      return undefined;
    }
  }, []);

  const handleLookupBarcode = useCallback(
    async (providedBarcode?: string) => {
      const nextBarcode = (providedBarcode ?? barcodeInput).trim();
      if (!nextBarcode) {
        setBarcodeMessage("Enter a barcode to look up.");
        setBarcodePreview(null);
        setBarcodePreviewImage(undefined);
        return;
      }

      setBarcodeLoading(true);
      setBarcodeMessage(null);
      setBarcodePreview(null);
      setBarcodePreviewImage(undefined);

      try {
        const result = await serviceResult(OpenFoodFactsService.GetProductByBarcode(nextBarcode));
        setBarcodeInput(nextBarcode);
        setBarcodePreview(result.data ?? null);

        if (result.data?.imageUrl) {
          const imageUrl = await fetchProductImage(result.data.imageUrl);
          setBarcodePreviewImage(imageUrl);
        }
      } catch (error) {
        setBarcodePreview(null);
        setBarcodePreviewImage(undefined);
        const message = errorText(error);
        setBarcodeMessage(message);
      } finally {
        setBarcodeLoading(false);
      }
    },
    [barcodeInput, fetchProductImage]
  );

  useEffect(() => {
    if (!barcodeDialogOpen || !videoRef.current) return;

    const codeReader = new BrowserMultiFormatReader();
    let stream: MediaStream | undefined;
    let stopped = false;
    let scannerControls: { stop: () => void } | undefined;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        if (!videoRef.current || stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scannerControls = await codeReader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!result || stopped) return;
          const scannedText = result.getText();
          if (scannedText) {
            void handleLookupBarcode(scannedText);
          }
        });
      } catch {
        // No camera available: the manual input path remains available.
      }
    };

    void startCamera();

    return () => {
      stopped = true;
      scannerControls?.stop();
      BrowserMultiFormatReader.releaseAllStreams();
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [barcodeDialogOpen, handleLookupBarcode]);

  // The item as the detail form's record: reloads the form whenever the item is refetched
  const itemRecord = useMemo(
    () =>
      item
        ? {
            id: item.lab_warehouseitemid,
            values: {
              lab_name: item.lab_name,
              lab_sku: item.lab_sku,
              lab_availablequantity: toNumber(item.lab_availablequantity),
              lab_category: toNumber(item.lab_category),
              lab_locationid: item._lab_locationid_value ?? null,
              lab_productid: item._lab_productid_value ?? null,
              statecode: Number(item.statecode),
            },
          }
        : undefined,
    [item]
  );

  const updateItemMutation = useMutation({
    // Only the fields the form says changed come in
    mutationFn: async (values: Record<string, unknown>) => {
      const payload: Record<string, unknown> = {};
      if ("lab_name" in values) payload.lab_name = values.lab_name;
      if ("lab_sku" in values) payload.lab_sku = values.lab_sku;
      // Option set values come out of the form as strings
      if ("lab_category" in values) payload.lab_category = Number(values.lab_category);
      if ("lab_locationid" in values) {
        payload["lab_locationid@odata.bind"] = values.lab_locationid
          ? `/lab_warehouselocations(${values.lab_locationid})`
          : null;
      }
      if ("lab_productid" in values) {
        payload["lab_productid@odata.bind"] = values.lab_productid
          ? `/lab_products(${values.lab_productid})`
          : null;
      }
      if (Object.keys(payload).length === 0) return;
      return serviceResult(Lab_warehouseitemsService.update(id!, servicePayload(payload)));
    },
    onSuccess: async () => {
      // Every list shows the same few records (Pick, Receive and the other tabs keep their own copies
      // for five minutes), so a change makes all of them stale: refetch what is on screen, the rest on its next visit
      await queryClient.invalidateQueries();
      toast.success("Item saved");
    },
    onError: (err) => {
      toast.error("Failed to save item: " + errorText(err));
    },
  });

  const handleLinkToItem = useCallback(async () => {
    if (!id || !barcodePreview) {
      return;
    }

    setBarcodeLinking(true);
    setBarcodeMessage(null);

    try {
      const barcode = barcodeInput.trim();
      const productMatches = await serviceResult(
        Lab_productsService.getAll({
          select: ["lab_productid", "lab_ean", "lab_name"],
          filter: `lab_ean eq '${barcode}'`,
        })
      );

      let productId = productMatches.data?.[0]?.lab_productid;
      if (!productId) {
        const createdProduct = await serviceResult(
          Lab_productsService.create(servicePayload({
            lab_name: barcodePreview.name || barcode,
            lab_ean: barcode,
            lab_brand: barcodePreview.brand ?? undefined,
            lab_quantity: barcodePreview.quantity ?? undefined,
            lab_imageurl: barcodePreview.imageUrl ?? undefined,
            lab_lastsyncedon: new Date().toISOString(),
          }))
        );
        productId = createdProduct.data?.lab_productid;
      }

      if (!productId) {
        throw new Error("Unable to create or find the linked product.");
      }

      await serviceResult(
        Lab_warehouseitemsService.update(id, servicePayload({
          "lab_productid@odata.bind": `/lab_products(${productId})`,
        }))
      );

      const imageToSave = barcodePreviewImage ?? (barcodePreview.imageUrl ? await fetchProductImage(barcodePreview.imageUrl) : undefined);
      if (imageToSave) {
        try {
          const imageBlob = await fetch(barcodePreviewImage ?? imageToSave).then((response) => response.blob());
          await serviceResult(
            Lab_productsService.update(productId, servicePayload({
              lab_productimage: imageBlob,
            }))
          );
        } catch (imageError) {
          toast.warning("Product linked, but the image could not be saved: " + errorText(imageError));
        }
      }

      await queryClient.invalidateQueries();
      setBarcodeDialogOpen(false);
      setBarcodePreview(null);
      setBarcodePreviewImage(undefined);
      setBarcodeInput("");
      toast.success("Product linked to item");
    } catch (error) {
      toast.error("Failed to link product: " + errorText(error));
    } finally {
      setBarcodeLinking(false);
    }
  }, [barcodeInput, barcodePreview, barcodePreviewImage, fetchProductImage, id, queryClient, toast]);

  const createTxMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      return serviceResult(Lab_warehousetransactionsService.create(servicePayload({
        lab_name: values.lab_name,
        lab_quantity: String(values.lab_quantity),
        // Option set values come out of the form as strings
        lab_transactiontype: Number(values.lab_transactiontype),
        lab_transactiondate: new Date().toISOString(),
        "lab_itemid@odata.bind": `/lab_warehouseitems(${id})`,
      })));
    },
    onSuccess: async () => {
      // Every list shows the same few records (Pick, Receive and the other tabs keep their own copies
      // for five minutes), so a change makes all of them stale: refetch what is on screen, the rest on its next visit
      await queryClient.invalidateQueries();
      toast.success("Transaction created");
    },
    onError: (err) => {
      toast.error("Failed to create transaction: " + errorText(err));
    },
  });

  if (itemLoading) {
    return (
      <Skeleton className={styles.page}>
        <SkeletonItem className={styles.skeletonTitle} />
        <SkeletonItem className={styles.skeletonCards} />
        <SkeletonItem className={styles.skeletonTable} />
      </Skeleton>
    );
  }

  if (!item) {
    return (
      <div className={styles.page}>
        <Body1 className={styles.muted}>Item not found.</Body1>
        <div>
          <Button appearance="transparent" icon={<ArrowLeftRegular />} onClick={() => navigate("/items")}>
            Back to items
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.details}>
        {itemRecord && (
          <RecordDetailForm
            entityName="lab_warehouseitem"
            record={itemRecord}
            fields={itemFields}
            columnCount={3}
            title={item.lab_name ?? ""}
            onBack={() => navigate("/items")}
            lookupRecords={{ lab_locationid: locationRecords, lab_productid: productRecords }}
            onSave={(values) => updateItemMutation.mutateAsync(values)}
            headerExtras={
              <div className={styles.inline}>
                {(linkedProduct || barcodePreview) && (
                  <div className={styles.productSummary}>
                    <img
                      className={styles.productImage}
                      src={barcodePreviewImage ?? linkedProduct?.lab_imageurl}
                      alt={barcodePreview?.name ?? linkedProduct?.lab_name ?? "Product image"}
                    />
                    <Text>{barcodePreview?.name ?? linkedProduct?.lab_name ?? "Product"}</Text>
                  </div>
                )}
                <Button
                  appearance="secondary"
                  icon={<CameraRegular />}
                  onClick={() => setBarcodeDialogOpen(true)}
                >
                  {linkedProduct ? "Rescan Barcode" : "Scan Barcode"}
                </Button>
              </div>
            }
            tabs={[
              {
                id: "transactions",
                label: "Transactions",
                // The grid's own ribbon carries New Transaction (and Refresh), like a model-driven subgrid
                content: (
                  <RecordGrid
                    rows={transactionRows}
                    columns={transactionColumns}
                    entityName="lab_warehousetransaction"
                    commands={[
                      { id: "new", label: "New Transaction", icon: "Add", onExecute: () => setDialogOpen(true) },
                    ]}
                    onRefresh={() => queryClient.refetchQueries({ queryKey: ["itemTransactions", id] })}
                  />
                ),
              },
            ]}
          />
        )}
      </div>

      <RecordFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={`New Transaction for ${item.lab_name}`}
        entityName="lab_warehousetransaction"
        fields={formFields}
        onCreate={(values) => createTxMutation.mutateAsync(values)}
        pending={createTxMutation.isPending}
        submitTestId="submit-transaction"
      />

      <Dialog open={barcodeDialogOpen} onOpenChange={(_, data) => setBarcodeDialogOpen(data.open)}>
        <DialogSurface className={styles.scanDialog}>
          <DialogBody>
            <DialogTitle>{linkedProduct ? "Rescan Barcode" : "Scan Barcode"}</DialogTitle>
            <DialogContent>
              <div className={styles.cameraFrame}>
                <video ref={videoRef} className={styles.cameraVideo} autoPlay playsInline muted />
              </div>

              <div className={styles.inline} style={{ marginTop: "16px" }}>
                <Input
                  value={barcodeInput}
                  onChange={(_, data) => setBarcodeInput(data.value)}
                  placeholder="Type or scan a barcode"
                  aria-label="Barcode"
                  style={{ flex: 1 }}
                />
                <Button
                  appearance="primary"
                  icon={<SearchRegular />}
                  onClick={() => void handleLookupBarcode()}
                  disabled={barcodeLoading}
                >
                  {barcodeLoading ? "Looking up..." : "Look Up"}
                </Button>
              </div>

              {barcodeMessage && <Text className={styles.errorText}>{barcodeMessage}</Text>}

              {barcodePreview && (
                <div className={styles.scanSummary} style={{ marginTop: "16px" }}>
                  <div>
                    <Text weight="semibold">{barcodePreview.name ?? "Product"}</Text>
                    {barcodePreview.brand && <div>{barcodePreview.brand}</div>}
                    {barcodePreview.quantity && <div>{barcodePreview.quantity}</div>}
                  </div>
                  {(barcodePreviewImage || barcodePreview.imageUrl) && (
                    <img
                      className={styles.scanImage}
                      src={barcodePreviewImage ?? barcodePreview.imageUrl}
                      alt={barcodePreview.name ?? "Product"}
                    />
                  )}
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setBarcodeDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={() => void handleLinkToItem()}
                disabled={!barcodePreview || barcodeLinking}
              >
                {barcodeLinking ? "Linking..." : "Link to Item"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
