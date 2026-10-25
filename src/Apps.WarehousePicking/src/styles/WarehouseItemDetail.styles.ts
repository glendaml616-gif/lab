import { makeStyles, tokens } from "@fluentui/react-components";

export const useStyles = makeStyles({
  page: {
    padding: tokens.spacingHorizontalXXL,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXL,
  },
  details: {
    display: "flex",
    flexDirection: "column",
  },
  // inline, muted and name are also used by the markup
  inline: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  name: {
    fontWeight: tokens.fontWeightSemibold,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  productSummary: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    maxWidth: "420px",
  },
  productImage: {
    width: "56px",
    height: "56px",
    objectFit: "cover",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  scanDialog: {
    maxWidth: "520px",
    width: "100%",
  },
  scanSummary: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 120px",
    gap: tokens.spacingHorizontalM,
    alignItems: "center",
  },
  scanImage: {
    width: "120px",
    height: "120px",
    objectFit: "cover",
    borderRadius: tokens.borderRadiusMedium,
  },
  cameraFrame: {
    width: "100%",
    minHeight: "260px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    marginTop: tokens.spacingVerticalS,
  },
  skeletonTitle: {
    width: "200px",
    height: "32px",
  },
  skeletonCards: {
    height: "128px",
  },
  skeletonTable: {
    height: "256px",
  },
});
