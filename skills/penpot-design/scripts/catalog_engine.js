// catalog_engine.js — the codesign-ui 1:1 design-system contract.
//
// The inventory is the host library, not a generic factory list:
//   · 01–02: fixed token CAPACITY (counts per category) so the Foundations/Color boards keep one layout;
//     brand values (colors/fonts/radii/shadow values) still come from DESIGN.md.
//   · 03–09: one BLOCK PAGE per codesign-ui Layer-1 component — `NN.MM · Chapter · Family·Spec` (CAT.BLOCKS).
//   · 18:    one BLOCK PAGE per codesign-ui Layer-2 AI composite (33 pages).
//   · 13:    the component index; the 6 behaviour-only primitives live there with no master.
//   · 10–17: free; source adaptation/profiles continue to work there.
//
// Seed:  load after component_factory + native_layout; call CAT.seed() once PageRoots exist.
// Build: scaffold_structure.js derives its page rows from CAT.BLOCKS, then CAT.buildPage({page:'03.01 · …'}) per page.
//        The build path is the paired library manifest (library_engine.js + LM.load(codesign-ui.json)); a mapped
//        factory draws one representative, a custom component an anatomy board.
// Audit: CAT.audit() / CAT.pageIssues() / CAT.auditFor({page, root}); rule 62 `catalog_drift` calls auditFor, and
//        designCoverage calls pageIssues so a missing block page is a delivery failure.
return (function (storage, penpot, penpotUtils) {
  const CAT = storage.CATALOG = storage.CATALOG || {};
  CAT.VERSION = '2.1.0';
  CAT.PAGE_NAMES = {"03": "03 · Actions", "04": "04 · Text fields", "05": "05 · Selection & pickers", "06": "06 · Data & lists", "07": "07 · Display & media", "08": "08 · Navigation", "09": "09 · Overlays & feedback", "18": "18 · AI & agents"};
  CAT.CAPACITY = { colors: 57, types: 12, spaces: 14, radii: 9, shadows: 13, dims: 2, strokes: 4, tones: 10 };
  // Generated 1:1 from assets/libraries/codesign-ui.json by scripts/inventory_library.py.
  // One visual component = one block page; nonVisual components are indexed on page 13.
  CAT.LIBRARY = [{"designFamily":"Button","page":"03","order":1,"group":"actions","factory":"button","kind":"visual","parts":["Button","ButtonIcon","ButtonLabel"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"IconButton","page":"03","order":2,"group":"actions","factory":"iconButton","kind":"visual","parts":["IconButton","IconButtonIcon"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"ButtonGroup","page":"03","order":3,"group":"actions","factory":"buttonGroup","kind":"visual","parts":["ButtonGroup","ButtonGroupItem"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"SplitButton","page":"03","order":4,"group":"actions","factory":"splitButton","kind":"visual","parts":["SplitButton","SplitButtonAction","SplitButtonTrigger"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"FAB","page":"03","order":5,"group":"actions","factory":"fab","kind":"visual","parts":["FabIcon","FabLabel","FabRoot"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"Link","page":"03","order":6,"group":"actions","factory":"link","kind":"visual","parts":["Link"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"Clipboard","page":"03","order":7,"group":"actions","factory":"custom","kind":"visual","parts":["ClipboardControl","ClipboardIndicator","ClipboardInput","ClipboardLabel","ClipboardRoot","ClipboardTrigger","ClipboardValueText"],"states":["default","hover","focus","disabled"],"layer":"components"},{"designFamily":"DownloadTrigger","page":"03","order":8,"group":"actions","factory":"custom","kind":"visual","parts":["DownloadTrigger"],"states":["default","hover","focus","disabled"],"layer":"components"},{"designFamily":"Toggle","page":"03","order":9,"group":"actions","factory":"button","kind":"visual","parts":["ToggleIndicator","ToggleRoot"],"states":["off","on","focus","disabled"],"layer":"components"},{"designFamily":"ToggleGroup","page":"03","order":10,"group":"actions","factory":"custom","kind":"visual","parts":["ToggleGroupItem","ToggleGroupRoot"],"states":["off","on","focus","disabled"],"layer":"components"},{"designFamily":"Input","page":"04","order":1,"group":"forms","factory":"input","kind":"visual","parts":["Input"],"states":["default","hover","focus","invalid","disabled"],"layer":"kit"},{"designFamily":"Textarea","page":"04","order":2,"group":"forms","factory":"textarea","kind":"visual","parts":["Textarea"],"states":["default","hover","focus","invalid","disabled"],"layer":"kit"},{"designFamily":"Search","page":"04","order":3,"group":"forms","factory":"searchField","kind":"visual","parts":["Search","SearchClearTrigger","SearchIcon","SearchInput"],"states":["default","hover","focus","invalid","disabled"],"layer":"kit"},{"designFamily":"MaskedInput","page":"04","order":4,"group":"forms","factory":"maskedInput","kind":"visual","parts":["MaskedInput"],"states":["default","hover","focus","invalid","disabled"],"layer":"kit"},{"designFamily":"Transfer","page":"04","order":5,"group":"forms","factory":"transfer","kind":"visual","parts":["Transfer","TransferActions","TransferItem","TransferList","TransferPanel"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"AngleSlider","page":"04","order":6,"group":"forms","factory":"custom","kind":"visual","parts":["AngleSliderControl","AngleSliderHiddenInput","AngleSliderLabel","AngleSliderMarker","AngleSliderMarkerGroup","AngleSliderRoot","AngleSliderThumb","AngleSliderValueText"],"states":["default","focus","disabled"],"layer":"components"},{"designFamily":"DateInput","page":"04","order":7,"group":"forms","factory":"custom","kind":"visual","parts":["DateInputControl","DateInputHiddenInput","DateInputLabel","DateInputRoot","DateInputSegment","DateInputSegmentGroup"],"states":["default","focus","invalid","disabled"],"layer":"components"},{"designFamily":"Editable","page":"04","order":8,"group":"forms","factory":"custom","kind":"visual","parts":["EditableArea","EditableCancelTrigger","EditableControl","EditableEditTrigger","EditableInput","EditableLabel","EditablePreview","EditableRoot","EditableSubmitTrigger"],"states":["default","focus","disabled"],"layer":"components"},{"designFamily":"Field","page":"04","order":9,"group":"forms","factory":"field","kind":"visual","parts":["FieldErrorText","FieldHelperText","FieldInput","FieldItem","FieldLabel","FieldRequiredIndicator","FieldRoot","FieldSelect","FieldTextarea"],"states":["default","focus","invalid","disabled"],"layer":"components"},{"designFamily":"Fieldset","page":"04","order":10,"group":"forms","factory":"custom","kind":"visual","parts":["FieldsetErrorText","FieldsetHelperText","FieldsetLegend","FieldsetRoot"],"states":["default","disabled"],"layer":"components"},{"designFamily":"FileUpload","page":"04","order":11,"group":"forms","factory":"upload","kind":"visual","parts":["FileUploadClearTrigger","FileUploadDropzone","FileUploadHiddenInput","FileUploadItem","FileUploadItemDeleteTrigger","FileUploadItemGroup","FileUploadItemName","FileUploadItemPreview","FileUploadItemPreviewImage","FileUploadItemSizeText","FileUploadLabel","FileUploadRoot","FileUploadTrigger"],"states":["default","dragging","disabled"],"layer":"components"},{"designFamily":"NumberInput","page":"04","order":12,"group":"forms","factory":"numberField","kind":"visual","parts":["NumberInputControl","NumberInputDecrementTrigger","NumberInputIncrementTrigger","NumberInputInput","NumberInputLabel","NumberInputRoot","NumberInputScrubber","NumberInputValueText"],"states":["default","focus","invalid","disabled"],"layer":"components"},{"designFamily":"PasswordInput","page":"04","order":13,"group":"forms","factory":"passwordField","kind":"visual","parts":["PasswordInputControl","PasswordInputIndicator","PasswordInputInput","PasswordInputLabel","PasswordInputRoot","PasswordInputVisibilityTrigger"],"states":["default","focus","invalid","disabled"],"layer":"components"},{"designFamily":"PinInput","page":"04","order":14,"group":"forms","factory":"otpInput","kind":"visual","parts":["PinInputControl","PinInputHiddenInput","PinInputInput","PinInputLabel","PinInputRoot"],"states":["default","focus","invalid","disabled"],"layer":"components"},{"designFamily":"SignaturePad","page":"04","order":15,"group":"forms","factory":"custom","kind":"visual","parts":["SignaturePadClearTrigger","SignaturePadControl","SignaturePadGuide","SignaturePadHiddenInput","SignaturePadLabel","SignaturePadRoot","SignaturePadSegment"],"states":["default","focus","disabled"],"layer":"components"},{"designFamily":"TagsInput","page":"04","order":16,"group":"forms","factory":"multiSelect","kind":"visual","parts":["TagsInputClearTrigger","TagsInputControl","TagsInputHiddenInput","TagsInputInput","TagsInputItem","TagsInputItemDeleteTrigger","TagsInputItemInput","TagsInputItemPreview","TagsInputItemText","TagsInputLabel","TagsInputRoot"],"states":["default","focus","invalid","disabled"],"layer":"components"},{"designFamily":"Checkbox","page":"05","order":1,"group":"selection","factory":"checkbox","kind":"visual","parts":["CheckboxControl","CheckboxGroup","CheckboxHiddenInput","CheckboxIndicator","CheckboxLabel","CheckboxRoot"],"states":["off","on","focus","disabled"],"layer":"components"},{"designFamily":"ColorPicker","page":"05","order":2,"group":"selection","factory":"colorPicker","kind":"visual","parts":["ColorPickerArea","ColorPickerAreaBackground","ColorPickerAreaThumb","ColorPickerChannelInput","ColorPickerChannelSlider","ColorPickerChannelSliderLabel","ColorPickerChannelSliderThumb","ColorPickerChannelSliderTrack","ColorPickerChannelSliderValueText","ColorPickerContent","ColorPickerControl","ColorPickerEyeDropperTrigger","ColorPickerFormatSelect","ColorPickerFormatTrigger","ColorPickerHiddenInput","ColorPickerLabel","ColorPickerPositioner","ColorPickerRoot","ColorPickerSwatch","ColorPickerSwatchGroup","ColorPickerSwatchIndicator","ColorPickerSwatchTrigger","ColorPickerTransparencyGrid","ColorPickerTrigger","ColorPickerValueSwatch","ColorPickerValueText","ColorPickerView"],"states":["closed","open","disabled"],"layer":"components"},{"designFamily":"Combobox","page":"05","order":3,"group":"selection","factory":"combobox","kind":"visual","parts":["ComboboxClearTrigger","ComboboxContent","ComboboxControl","ComboboxEmpty","ComboboxInput","ComboboxItem","ComboboxItemGroup","ComboboxItemGroupLabel","ComboboxItemIndicator","ComboboxItemText","ComboboxLabel","ComboboxList","ComboboxPositioner","ComboboxRoot","ComboboxTrigger"],"states":["closed","open","disabled"],"layer":"components"},{"designFamily":"DatePicker","page":"05","order":4,"group":"selection","factory":"datePicker","kind":"visual","parts":["DatePickerClearTrigger","DatePickerContent","DatePickerControl","DatePickerInput","DatePickerLabel","DatePickerMonthSelect","DatePickerNextTrigger","DatePickerPositioner","DatePickerPresetTrigger","DatePickerPrevTrigger","DatePickerRangeText","DatePickerRoot","DatePickerTable","DatePickerTableBody","DatePickerTableCell","DatePickerTableCellTrigger","DatePickerTableHead","DatePickerTableHeader","DatePickerTableRow","DatePickerTrigger","DatePickerValueText","DatePickerView","DatePickerViewControl","DatePickerViewTrigger","DatePickerWeekNumberCell","DatePickerWeekNumberHeaderCell","DatePickerYearSelect"],"states":["closed","open","disabled"],"layer":"components"},{"designFamily":"TimePicker","page":"05","order":5,"group":"selection","factory":"timePicker","kind":"visual","parts":["TimePicker","TimePickerContent","TimePickerInput","TimePickerTrigger"],"states":["closed","open","disabled"],"layer":"kit"},{"designFamily":"RadioGroup","page":"05","order":6,"group":"selection","factory":"radio","kind":"visual","parts":["RadioGroupIndicator","RadioGroupItem","RadioGroupItemControl","RadioGroupItemHiddenInput","RadioGroupItemText","RadioGroupLabel","RadioGroupRoot"],"states":["off","on","focus","disabled"],"layer":"components"},{"designFamily":"RatingGroup","page":"05","order":7,"group":"selection","factory":"rating","kind":"visual","parts":["RatingGroupControl","RatingGroupHiddenInput","RatingGroupItem","RatingGroupLabel","RatingGroupRoot"],"states":["default","focus","disabled"],"layer":"components"},{"designFamily":"SegmentGroup","page":"05","order":8,"group":"selection","factory":"segmented","kind":"visual","parts":["SegmentGroupIndicator","SegmentGroupItem","SegmentGroupItemControl","SegmentGroupItemHiddenInput","SegmentGroupItemText","SegmentGroupLabel","SegmentGroupRoot"],"states":["off","on","focus","disabled"],"layer":"components"},{"designFamily":"Select","page":"05","order":9,"group":"selection","factory":"select","kind":"visual","parts":["SelectClearTrigger","SelectContent","SelectControl","SelectHiddenSelect","SelectIndicator","SelectItem","SelectItemGroup","SelectItemGroupLabel","SelectItemIndicator","SelectItemText","SelectLabel","SelectList","SelectPositioner","SelectRoot","SelectTrigger","SelectValueText"],"states":["closed","open","disabled"],"layer":"components"},{"designFamily":"Slider","page":"05","order":10,"group":"selection","factory":"slider","kind":"visual","parts":["SliderControl","SliderDraggingIndicator","SliderHiddenInput","SliderLabel","SliderMarker","SliderMarkerGroup","SliderRange","SliderRoot","SliderThumb","SliderTrack","SliderValueText"],"states":["default","focus","disabled"],"layer":"components"},{"designFamily":"Switch","page":"05","order":11,"group":"selection","factory":"switch","kind":"visual","parts":["SwitchControl","SwitchHiddenInput","SwitchLabel","SwitchRoot","SwitchThumb"],"states":["off","on","focus","disabled"],"layer":"components"},{"designFamily":"TableHeader","page":"06","order":1,"group":"data","factory":"tableHeader","kind":"visual","parts":["TableHeader","TableHeaderCell","TableHeaderSortTrigger"],"states":["default"],"layer":"kit"},{"designFamily":"TableRow","page":"06","order":2,"group":"data","factory":"tableRow","kind":"visual","parts":["TableRow","TableRowCell"],"states":["default","hover","selected","focus","disabled"],"layer":"kit"},{"designFamily":"TableState","page":"06","order":3,"group":"data","factory":"tableState","kind":"visual","parts":["TableState","TableStateAction","TableStateDescription","TableStateIcon","TableStateTitle"],"states":["default"],"layer":"kit"},{"designFamily":"ListItem","page":"06","order":4,"group":"data","factory":"listItem","kind":"visual","parts":["ListItem","ListItemContent","ListItemDescription","ListItemTitle","ListItemTrailing"],"states":["default","hover","selected","focus","disabled"],"layer":"kit"},{"designFamily":"Descriptions","page":"06","order":5,"group":"data","factory":"descriptions","kind":"visual","parts":["Descriptions","DescriptionsItem","DescriptionsLabel","DescriptionsValue"],"states":["default"],"layer":"kit"},{"designFamily":"Timeline","page":"06","order":6,"group":"data","factory":"timeline","kind":"visual","parts":["Timeline","TimelineContent","TimelineIndicator","TimelineItem"],"states":["default"],"layer":"kit"},{"designFamily":"MiniCalendar","page":"06","order":7,"group":"data","factory":"miniCalendar","kind":"visual","parts":["MiniCalendar","MiniCalendarDay","MiniCalendarGrid"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"Carousel","page":"06","order":8,"group":"data","factory":"carousel","kind":"visual","parts":["CarouselAutoplayIndicator","CarouselAutoplayTrigger","CarouselControl","CarouselIndicator","CarouselIndicatorGroup","CarouselItem","CarouselItemGroup","CarouselNextTrigger","CarouselPrevTrigger","CarouselProgressText","CarouselRoot"],"states":["default","hover","focus","disabled"],"layer":"components"},{"designFamily":"JsonTreeView","page":"06","order":9,"group":"data","factory":"custom","kind":"visual","parts":["JsonTreeViewRoot","JsonTreeViewTree"],"states":["closed","open"],"layer":"components"},{"designFamily":"Listbox","page":"06","order":10,"group":"data","factory":"select","kind":"visual","parts":["ListboxContent","ListboxEmpty","ListboxInput","ListboxItem","ListboxItemGroup","ListboxItemGroupLabel","ListboxItemIndicator","ListboxItemText","ListboxLabel","ListboxRoot","ListboxValueText"],"states":["closed","open","disabled"],"layer":"components"},{"designFamily":"TreeView","page":"06","order":11,"group":"data","factory":"custom","kind":"visual","parts":["TreeViewBranch","TreeViewBranchContent","TreeViewBranchControl","TreeViewBranchIndentGuide","TreeViewBranchIndicator","TreeViewBranchText","TreeViewBranchTrigger","TreeViewItem","TreeViewItemIndicator","TreeViewItemText","TreeViewLabel","TreeViewNodeCheckbox","TreeViewNodeCheckboxIndicator","TreeViewNodeRenameInput","TreeViewRoot","TreeViewTree"],"states":["closed","open","selected","disabled"],"layer":"components"},{"designFamily":"Badge","page":"07","order":1,"group":"data","factory":"badge","kind":"visual","parts":["Badge"],"states":["default"],"layer":"kit"},{"designFamily":"StatusText","page":"07","order":2,"group":"data","factory":"statusText","kind":"visual","parts":["StatusText","StatusTextIndicator"],"states":["default"],"layer":"kit"},{"designFamily":"Chip","page":"07","order":3,"group":"data","factory":"chip","kind":"visual","parts":["Chip","ChipLabel","ChipRemoveTrigger"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"AvatarGroup","page":"07","order":4,"group":"data","factory":"avatarGroup","kind":"visual","parts":["AvatarGroup","AvatarGroupItem"],"states":["default"],"layer":"kit"},{"designFamily":"Card","page":"07","order":5,"group":"data","factory":"card","kind":"visual","parts":["Card","CardContent","CardDescription","CardFooter","CardHeader","CardTitle"],"states":["default","hover","selected","focus"],"layer":"kit"},{"designFamily":"KPI","page":"07","order":6,"group":"data","factory":"kpi","kind":"visual","parts":["KpiDelta","KpiLabel","KpiRoot","KpiValue"],"states":["default"],"layer":"kit"},{"designFamily":"Skeleton","page":"07","order":7,"group":"data","factory":"skeleton","kind":"visual","parts":["Skeleton"],"states":["default"],"layer":"kit"},{"designFamily":"EmptyState","page":"07","order":8,"group":"data","factory":"emptyState","kind":"visual","parts":["EmptyState","EmptyStateAction","EmptyStateDescription","EmptyStateIcon","EmptyStateTitle"],"states":["default"],"layer":"kit"},{"designFamily":"Avatar","page":"07","order":9,"group":"data","factory":"avatar","kind":"visual","parts":["AvatarFallback","AvatarImage","AvatarRoot"],"states":["default","disabled"],"layer":"components"},{"designFamily":"Frame","page":"07","order":10,"group":"data","factory":"custom","kind":"visual","parts":["Frame"],"states":["default"],"layer":"components"},{"designFamily":"Highlight","page":"07","order":11,"group":"data","factory":"custom","kind":"visual","parts":["Highlight"],"states":["default"],"layer":"components"},{"designFamily":"ImageCropper","page":"07","order":12,"group":"data","factory":"custom","kind":"visual","parts":["ImageCropperGrid","ImageCropperHandle","ImageCropperImage","ImageCropperRoot","ImageCropperSelection","ImageCropperViewport"],"states":["default","dragging"],"layer":"components"},{"designFamily":"Marquee","page":"07","order":13,"group":"data","factory":"custom","kind":"visual","parts":["MarqueeContent","MarqueeEdge","MarqueeItem","MarqueeRoot","MarqueeViewport"],"states":["default"],"layer":"components"},{"designFamily":"Progress","page":"07","order":14,"group":"data","factory":"progress","kind":"visual","parts":["ProgressCircle","ProgressCircleRange","ProgressCircleTrack","ProgressLabel","ProgressRange","ProgressRoot","ProgressTrack","ProgressValueText","ProgressView"],"states":["default","indeterminate"],"layer":"components"},{"designFamily":"QrCode","page":"07","order":15,"group":"data","factory":"custom","kind":"visual","parts":["QrCodeDownloadTrigger","QrCodeFrame","QrCodeOverlay","QrCodePattern","QrCodeRoot"],"states":["default"],"layer":"components"},{"designFamily":"ScrollArea","page":"07","order":16,"group":"data","factory":"custom","kind":"visual","parts":["ScrollAreaContent","ScrollAreaCorner","ScrollAreaRoot","ScrollAreaScrollbar","ScrollAreaThumb","ScrollAreaViewport"],"states":["default"],"layer":"components"},{"designFamily":"Splitter","page":"07","order":17,"group":"data","factory":"custom","kind":"visual","parts":["SplitterPanel","SplitterResizeTrigger","SplitterResizeTriggerIndicator","SplitterRoot"],"states":["default","focus"],"layer":"components"},{"designFamily":"Swap","page":"07","order":18,"group":"data","factory":"custom","kind":"visual","parts":["SwapIndicator","SwapRoot"],"states":["off","on"],"layer":"components"},{"designFamily":"Timer","page":"07","order":19,"group":"data","factory":"custom","kind":"visual","parts":["TimerActionTrigger","TimerArea","TimerControl","TimerItem","TimerRoot","TimerSeparator"],"states":["default","running","paused"],"layer":"components"},{"designFamily":"NavItem","page":"08","order":1,"group":"navigation","factory":"navItem","kind":"visual","parts":["NavItem","NavItemIcon","NavItemLabel","NavItemTrailing"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"TabBand","page":"08","order":2,"group":"navigation","factory":"tabBand","kind":"visual","parts":["TabBand","TabBandItem","TabBandList"],"states":["default"],"layer":"kit"},{"designFamily":"Breadcrumb","page":"08","order":3,"group":"navigation","factory":"breadcrumb","kind":"visual","parts":["Breadcrumb","BreadcrumbCurrent","BreadcrumbItem","BreadcrumbLink","BreadcrumbList","BreadcrumbSeparator"],"states":["default","hover","focus","pressed","disabled"],"layer":"kit"},{"designFamily":"CommandPalette","page":"08","order":4,"group":"navigation","factory":"commandPalette","kind":"visual","parts":["CommandPalette","CommandPaletteEmpty","CommandPaletteGroup","CommandPaletteInput","CommandPaletteItem","CommandPaletteList"],"states":["default"],"layer":"kit"},{"designFamily":"Accordion","page":"08","order":5,"group":"navigation","factory":"accordion","kind":"visual","parts":["AccordionItem","AccordionItemContent","AccordionItemIndicator","AccordionItemTrigger","AccordionRoot"],"states":["closed","open","disabled"],"layer":"components"},{"designFamily":"Collapsible","page":"08","order":6,"group":"navigation","factory":"custom","kind":"visual","parts":["CollapsibleContent","CollapsibleIndicator","CollapsibleRoot","CollapsibleTrigger"],"states":["closed","open"],"layer":"components"},{"designFamily":"Menu","page":"08","order":7,"group":"navigation","factory":"menu","kind":"visual","parts":["MenuArrow","MenuArrowTip","MenuCheckboxItem","MenuContent","MenuContextTrigger","MenuIndicator","MenuItem","MenuItemGroup","MenuItemGroupLabel","MenuItemIndicator","MenuItemText","MenuPositioner","MenuRadioItem","MenuRadioItemGroup","MenuRoot","MenuSeparator","MenuTrigger","MenuTriggerItem"],"states":["closed","open","disabled"],"layer":"components"},{"designFamily":"NavigationMenu","page":"08","order":8,"group":"navigation","factory":"custom","kind":"visual","parts":["NavigationMenuArrow","NavigationMenuContent","NavigationMenuIndicator","NavigationMenuItem","NavigationMenuItemIndicator","NavigationMenuLink","NavigationMenuList","NavigationMenuRoot","NavigationMenuTrigger","NavigationMenuViewport","NavigationMenuViewportPositioner"],"states":["closed","open"],"layer":"components"},{"designFamily":"Pagination","page":"08","order":9,"group":"navigation","factory":"pagination","kind":"visual","parts":["PaginationEllipsis","PaginationFirstTrigger","PaginationItem","PaginationLastTrigger","PaginationNextTrigger","PaginationPrevTrigger","PaginationRoot"],"states":["default","hover","focus","disabled"],"layer":"components"},{"designFamily":"Steps","page":"08","order":10,"group":"navigation","factory":"steps","kind":"visual","parts":["StepsCompletedContent","StepsContent","StepsIndicator","StepsItem","StepsList","StepsNextTrigger","StepsPrevTrigger","StepsProgress","StepsRoot","StepsSeparator","StepsTrigger"],"states":["default","focus","disabled"],"layer":"components"},{"designFamily":"Tabs","page":"08","order":11,"group":"navigation","factory":"tabs","kind":"visual","parts":["TabsRoot"],"states":["default","hover","focus","disabled","selected"],"layer":"components"},{"designFamily":"Toc","page":"08","order":12,"group":"navigation","factory":"anchor","kind":"visual","parts":["TocContent","TocIndicator","TocItem","TocLink","TocList","TocNav","TocRoot","TocTitle"],"states":["default","hover","focus"],"layer":"components"},{"designFamily":"Alert","page":"09","order":1,"group":"feedback","factory":"alert","kind":"visual","parts":["Alert","AlertAction","AlertDescription","AlertIcon","AlertTitle"],"states":["default"],"layer":"kit"},{"designFamily":"Notification","page":"09","order":2,"group":"feedback","factory":"notification","kind":"visual","parts":["Notification","NotificationAction","NotificationCloseTrigger","NotificationDescription","NotificationIcon","NotificationTitle"],"states":["default"],"layer":"kit"},{"designFamily":"Popconfirm","page":"09","order":3,"group":"feedback","factory":"popconfirm","kind":"visual","parts":["Popconfirm","PopconfirmActions","PopconfirmContent","PopconfirmDescription","PopconfirmTitle","PopconfirmTrigger"],"states":["closed","open"],"layer":"kit"},{"designFamily":"Spin","page":"09","order":4,"group":"feedback","factory":"spin","kind":"visual","parts":["Spin","SpinIndicator","SpinLabel"],"states":["default"],"layer":"kit"},{"designFamily":"Sheet","page":"09","order":5,"group":"feedback","factory":"sheet","kind":"visual","parts":["Sheet","SheetBody","SheetCloseTrigger","SheetContent","SheetFooter","SheetHeader","SheetTitle"],"states":["closed","open"],"layer":"kit"},{"designFamily":"Dialog","page":"09","order":6,"group":"feedback","factory":"modal","kind":"visual","parts":["DialogBackdrop","DialogCloseTrigger","DialogContent","DialogDescription","DialogPositioner","DialogRoot","DialogTitle","DialogTrigger"],"states":["closed","open"],"layer":"components"},{"designFamily":"Drawer","page":"09","order":7,"group":"feedback","factory":"drawer","kind":"visual","parts":["DrawerBackdrop","DrawerCloseTrigger","DrawerContent","DrawerDescription","DrawerGrabber","DrawerGrabberIndicator","DrawerIndent","DrawerIndentBackground","DrawerPositioner","DrawerRoot","DrawerStack","DrawerSwipeArea","DrawerTitle","DrawerTrigger"],"states":["closed","open"],"layer":"components"},{"designFamily":"FloatingPanel","page":"09","order":8,"group":"feedback","factory":"custom","kind":"visual","parts":["FloatingPanelBody","FloatingPanelCloseTrigger","FloatingPanelContent","FloatingPanelControl","FloatingPanelDragTrigger","FloatingPanelHeader","FloatingPanelPositioner","FloatingPanelResizeTrigger","FloatingPanelRoot","FloatingPanelStageTrigger","FloatingPanelTitle","FloatingPanelTrigger"],"states":["closed","open"],"layer":"components"},{"designFamily":"HoverCard","page":"09","order":9,"group":"feedback","factory":"custom","kind":"visual","parts":["HoverCardArrow","HoverCardArrowTip","HoverCardContent","HoverCardPositioner","HoverCardRoot","HoverCardTrigger"],"states":["closed","open"],"layer":"components"},{"designFamily":"Popover","page":"09","order":10,"group":"feedback","factory":"popover","kind":"visual","parts":["PopoverAnchor","PopoverArrow","PopoverArrowTip","PopoverCloseTrigger","PopoverContent","PopoverDescription","PopoverIndicator","PopoverPositioner","PopoverRoot","PopoverTitle","PopoverTrigger"],"states":["closed","open"],"layer":"components"},{"designFamily":"Toast","page":"09","order":11,"group":"feedback","factory":"toast","kind":"visual","parts":["ToastActionTrigger","ToastCloseTrigger","ToastDescription","ToastRoot","ToastTitle","Toaster"],"states":["closed","open"],"layer":"components"},{"designFamily":"Tooltip","page":"09","order":12,"group":"feedback","factory":"tooltip","kind":"visual","parts":["TooltipArrow","TooltipArrowTip","TooltipContent","TooltipPositioner","TooltipRoot","TooltipTrigger"],"states":["closed","open"],"layer":"components"},{"designFamily":"Tour","page":"09","order":13,"group":"feedback","factory":"custom","kind":"visual","parts":["TourActionTrigger","TourActions","TourArrow","TourArrowTip","TourBackdrop","TourCloseTrigger","TourContent","TourControl","TourDescription","TourPositioner","TourProgressText","TourRoot","TourSpotlight","TourTitle"],"states":["closed","open"],"layer":"components"},{"designFamily":"ClientOnly","page":"13","order":99,"group":"utility","factory":"custom","kind":"nonVisual","parts":["ClientOnly"],"states":[],"layer":"components"},{"designFamily":"Collection","page":"13","order":99,"group":"utility","factory":"custom","kind":"nonVisual","parts":[],"states":[],"layer":"components"},{"designFamily":"FocusTrap","page":"13","order":99,"group":"utility","factory":"custom","kind":"nonVisual","parts":["FocusTrap"],"states":[],"layer":"components"},{"designFamily":"Format","page":"13","order":99,"group":"utility","factory":"custom","kind":"nonVisual","parts":["FormatByte","FormatNumber","FormatRelativeTime","FormatTime"],"states":[],"layer":"components"},{"designFamily":"Portal","page":"13","order":99,"group":"utility","factory":"custom","kind":"nonVisual","parts":["Portal"],"states":[],"layer":"components"},{"designFamily":"Presence","page":"13","order":99,"group":"utility","factory":"custom","kind":"nonVisual","parts":[],"states":[],"layer":"components"},{"designFamily":"Conversation","page":"18","order":1,"group":"ai","factory":"custom","kind":"visual","parts":["Conversation","ConversationContent","ConversationEmptyState","ConversationScrollToBottom"],"states":["default"],"layer":"ai"},{"designFamily":"Message","page":"18","order":2,"group":"ai","factory":"custom","kind":"visual","parts":["Message","MessageAction","MessageActions","MessageBranch","MessageBranchContent","MessageBranchNext","MessageBranchPage","MessageBranchPrevious","MessageBranchSelector","MessageContent","MessageToolbar"],"states":["default","hover"],"layer":"ai"},{"designFamily":"PromptInput","page":"18","order":3,"group":"ai","factory":"custom","kind":"visual","parts":["PromptInput","PromptInputActionAddAttachments","PromptInputActionAddScreenshot","PromptInputActionMenu","PromptInputActionMenuContent","PromptInputActionMenuItem","PromptInputActionMenuTrigger","PromptInputBody","PromptInputButton","PromptInputFooter","PromptInputHeader","PromptInputSubmit","PromptInputTextarea","PromptInputTools"],"states":["default","focus","disabled"],"layer":"ai"},{"designFamily":"ModelSelector","page":"18","order":4,"group":"ai","factory":"custom","kind":"visual","parts":["ModelSelector","ModelSelectorContent","ModelSelectorEmpty","ModelSelectorGroup","ModelSelectorInput","ModelSelectorItem","ModelSelectorList","ModelSelectorLogo","ModelSelectorLogoGroup","ModelSelectorName","ModelSelectorSeparator","ModelSelectorShortcut","ModelSelectorTrigger"],"states":["closed","open"],"layer":"ai"},{"designFamily":"Attachments","page":"18","order":5,"group":"ai","factory":"custom","kind":"visual","parts":["Attachment","AttachmentEmpty","AttachmentInfo","AttachmentPreview","AttachmentRemove","Attachments"],"states":["default","hover"],"layer":"ai"},{"designFamily":"Suggestion","page":"18","order":6,"group":"ai","factory":"custom","kind":"visual","parts":["Suggestion","Suggestions"],"states":["default","hover"],"layer":"ai"},{"designFamily":"Sources","page":"18","order":7,"group":"ai","factory":"custom","kind":"visual","parts":["Source","Sources","SourcesContent","SourcesTrigger"],"states":["closed","open"],"layer":"ai"},{"designFamily":"InlineCitation","page":"18","order":8,"group":"ai","factory":"custom","kind":"visual","parts":["InlineCitation","InlineCitationCard","InlineCitationCardBody","InlineCitationCardTrigger","InlineCitationCarousel","InlineCitationCarouselContent","InlineCitationCarouselHeader","InlineCitationCarouselIndex","InlineCitationCarouselItem","InlineCitationCarouselNext","InlineCitationCarouselPrev","InlineCitationQuote","InlineCitationSource","InlineCitationText"],"states":["closed","open"],"layer":"ai"},{"designFamily":"Reasoning","page":"18","order":9,"group":"ai","factory":"custom","kind":"visual","parts":["Reasoning","ReasoningContent","ReasoningTrigger"],"states":["collapsed","expanded"],"layer":"ai"},{"designFamily":"ChainOfThought","page":"18","order":10,"group":"ai","factory":"custom","kind":"visual","parts":["ChainOfThought","ChainOfThoughtContent","ChainOfThoughtHeader","ChainOfThoughtImage","ChainOfThoughtSearchResult","ChainOfThoughtSearchResults","ChainOfThoughtStep"],"states":["collapsed","expanded"],"layer":"ai"},{"designFamily":"Plan","page":"18","order":11,"group":"ai","factory":"custom","kind":"visual","parts":["Plan","PlanAction","PlanBody","PlanContent","PlanDescription","PlanFooter","PlanHeader","PlanTitle","PlanTrigger"],"states":["default"],"layer":"ai"},{"designFamily":"Tool","page":"18","order":12,"group":"ai","factory":"custom","kind":"visual","parts":["Tool","ToolContent","ToolHeader","ToolInput","ToolOutput"],"states":["collapsed","expanded"],"layer":"ai"},{"designFamily":"Task","page":"18","order":13,"group":"ai","factory":"custom","kind":"visual","parts":["Task","TaskContent","TaskItem","TaskItemFile","TaskTrigger"],"states":["pending","running","done"],"layer":"ai"},{"designFamily":"Queue","page":"18","order":14,"group":"ai","factory":"custom","kind":"visual","parts":["Queue","QueueItem","QueueItemAction","QueueItemActions","QueueItemAttachment","QueueItemContent","QueueItemDescription","QueueItemFile","QueueItemImage","QueueItemIndicator","QueueList","QueueSection","QueueSectionContent","QueueSectionLabel","QueueSectionTrigger"],"states":["default","hover"],"layer":"ai"},{"designFamily":"Confirmation","page":"18","order":15,"group":"ai","factory":"custom","kind":"visual","parts":["Confirmation","ConfirmationAccepted","ConfirmationAction","ConfirmationActions","ConfirmationRejected","ConfirmationRequest","ConfirmationTitle"],"states":["request","accepted","rejected"],"layer":"ai"},{"designFamily":"Question","page":"18","order":16,"group":"ai","factory":"custom","kind":"visual","parts":["Question","QuestionActions","QuestionDescription","QuestionInput","QuestionOption","QuestionOptions","QuestionPrompt","QuestionSubmit"],"states":["default","answered"],"layer":"ai"},{"designFamily":"Agent","page":"18","order":17,"group":"ai","factory":"custom","kind":"visual","parts":["Agent","AgentContent","AgentHeader","AgentInstructions","AgentOutput","AgentTool","AgentTools"],"states":["idle","running","done"],"layer":"ai"},{"designFamily":"Artifact","page":"18","order":18,"group":"ai","factory":"custom","kind":"visual","parts":["Artifact","ArtifactAction","ArtifactActions","ArtifactContent","ArtifactDescription","ArtifactHeader","ArtifactTitle"],"states":["default"],"layer":"ai"},{"designFamily":"CodeBlock","page":"18","order":19,"group":"ai","factory":"custom","kind":"visual","parts":["CodeBlock","CodeBlockActions","CodeBlockContainer","CodeBlockContent","CodeBlockCopyButton","CodeBlockFilename","CodeBlockHeader","CodeBlockTitle"],"states":["default","copied"],"layer":"ai"},{"designFamily":"Snippet","page":"18","order":20,"group":"ai","factory":"custom","kind":"visual","parts":["Snippet","SnippetAddon","SnippetCopyButton","SnippetInput","SnippetText"],"states":["default","copied"],"layer":"ai"},{"designFamily":"Terminal","page":"18","order":21,"group":"ai","factory":"custom","kind":"visual","parts":["Terminal","TerminalActions","TerminalClearButton","TerminalContent","TerminalCopyButton","TerminalHeader","TerminalStatus","TerminalTitle"],"states":["default"],"layer":"ai"},{"designFamily":"Sandbox","page":"18","order":22,"group":"ai","factory":"custom","kind":"visual","parts":["Sandbox","SandboxContent","SandboxHeader","SandboxTabContent","SandboxTabs","SandboxTabsBar","SandboxTabsList","SandboxTabsTrigger"],"states":["default"],"layer":"ai"},{"designFamily":"WebPreview","page":"18","order":23,"group":"ai","factory":"custom","kind":"visual","parts":["WebPreview","WebPreviewBody","WebPreviewConsole","WebPreviewNavigation","WebPreviewNavigationButton","WebPreviewUrl"],"states":["default"],"layer":"ai"},{"designFamily":"JSXPreview","page":"18","order":24,"group":"ai","factory":"custom","kind":"visual","parts":["JSXPreview","JSXPreviewContent","JSXPreviewError"],"states":["default","error"],"layer":"ai"},{"designFamily":"SchemaDisplay","page":"18","order":25,"group":"ai","factory":"custom","kind":"visual","parts":["SchemaDisplay","SchemaDisplayContent","SchemaDisplayDescription","SchemaDisplayExample","SchemaDisplayHeader","SchemaDisplayMethod","SchemaDisplayParameter","SchemaDisplayPath","SchemaDisplayProperty","SchemaDisplaySection"],"states":["default"],"layer":"ai"},{"designFamily":"EnvironmentVariables","page":"18","order":26,"group":"ai","factory":"custom","kind":"visual","parts":["EnvironmentVariable","EnvironmentVariableCopyButton","EnvironmentVariableGroup","EnvironmentVariableName","EnvironmentVariableRequired","EnvironmentVariableValue","EnvironmentVariables","EnvironmentVariablesContent","EnvironmentVariablesHeader","EnvironmentVariablesTitle","EnvironmentVariablesToggle"],"states":["default","revealed"],"layer":"ai"},{"designFamily":"PackageInfo","page":"18","order":27,"group":"ai","factory":"custom","kind":"visual","parts":["PackageInfo","PackageInfoChangeType","PackageInfoContent","PackageInfoDependencies","PackageInfoDependency","PackageInfoDescription","PackageInfoHeader","PackageInfoName","PackageInfoVersion"],"states":["default"],"layer":"ai"},{"designFamily":"Commit","page":"18","order":28,"group":"ai","factory":"custom","kind":"visual","parts":["Commit","CommitActions","CommitAuthor","CommitAuthorAvatar","CommitContent","CommitCopyButton","CommitFile","CommitFileAdditions","CommitFileChanges","CommitFileDeletions","CommitFileInfo","CommitFilePath","CommitFileStatus","CommitFiles","CommitHash","CommitHeader","CommitInfo","CommitMessage","CommitMetadata","CommitSeparator","CommitTimestamp"],"states":["default"],"layer":"ai"},{"designFamily":"Checkpoint","page":"18","order":29,"group":"ai","factory":"custom","kind":"visual","parts":["Checkpoint","CheckpointIcon","CheckpointTrigger"],"states":["default"],"layer":"ai"},{"designFamily":"Context","page":"18","order":30,"group":"ai","factory":"custom","kind":"visual","parts":["Context","ContextCacheUsage","ContextContent","ContextContentBody","ContextContentFooter","ContextContentHeader","ContextInputUsage","ContextOutputUsage","ContextReasoningUsage","ContextTrigger"],"states":["closed","open"],"layer":"ai"},{"designFamily":"StackTrace","page":"18","order":31,"group":"ai","factory":"custom","kind":"visual","parts":["StackTrace","StackTraceActions","StackTraceContent","StackTraceCopyButton","StackTraceErrorMessage","StackTraceErrorType","StackTraceFrames","StackTraceHeader"],"states":["collapsed","expanded"],"layer":"ai"},{"designFamily":"TestResults","page":"18","order":32,"group":"ai","factory":"custom","kind":"visual","parts":["Test","TestDuration","TestError","TestErrorMessage","TestErrorStack","TestName","TestResults","TestResultsContent","TestResultsDuration","TestResultsHeader","TestResultsProgress","TestResultsSummary","TestStatus","TestSuite","TestSuiteContent","TestSuiteName","TestSuiteStats"],"states":["default","expanded"],"layer":"ai"},{"designFamily":"Shimmer","page":"18","order":33,"group":"ai","factory":"custom","kind":"visual","parts":["Shimmer"],"states":["default"],"layer":"ai"}];
  CAT.planFromLibrary = function (list) {
    const plan = {}, by = {};
    (list || []).forEach((c) => {
      if ((c.kind || 'visual') !== 'visual') return;
      const p = String(c.page);
      (by[p] = by[p] || []).push(c);
    });
    Object.keys(by).sort((a, b) => Number(a) - Number(b)).forEach((p) => {
      by[p].sort((a, b) => (a.order || 99) - (b.order || 99) || String(a.designFamily).localeCompare(String(b.designFamily)));
      plan[p] = by[p].map((c) => ({
        key: c.factory || 'custom', family: c.designFamily, cls: 'ctl',
        axes: (c.states && c.states.length) ? c.states : ['default'],
        rows: [{ label: 'Default', props: {} }],
        w: 1000, cellH: 200, factory: c.factory || 'custom', kind: c.kind || 'visual',
        parts: c.parts || [], states: c.states || [], group: c.group, layer: c.layer
      }));
    });
    return plan;
  };
  CAT.PLAN = CAT.planFromLibrary(CAT.LIBRARY);
  CAT.INVENTORY = {
    name: 'codesign-ui', components: CAT.LIBRARY.length,
    visual: CAT.LIBRARY.filter((c) => (c.kind || 'visual') === 'visual').length,
    nonVisual: CAT.LIBRARY.filter((c) => (c.kind || 'visual') !== 'visual').length,
    pages: Object.keys(CAT.PLAN).reduce((n, k) => n + CAT.PLAN[k].length, 0)
  };

  // ---- block pages are the 03–09 standard (penpot-structure.md §2.3) ----
  // One page per canonical family, named `NN.MM · Chapter · <Family>·Spec`. `MM` is the 1-based position in
  // CAT.PLAN (the canonical order), not the board's current shelf position. The page list is derived here so
  // scaffold_structure.js, buildPage, the auditor and the library pairing all read ONE inventory.
  CAT.BLOCKS = [];
  Object.keys(CAT.PLAN).sort((a, b) => Number(a) - Number(b)).forEach((nn) => {
    const chapterName = String(CAT.PAGE_NAMES[nn] || nn).replace(/^\d{2} · /, '');
    CAT.PLAN[nn].forEach((f, i) => {
      const mm = String(i + 1).padStart(2, '0');
      CAT.BLOCKS.push({
        chapter: nn, chapterName: chapterName, index: i + 1, mm: mm,
        family: f.family, spec: f.family + '·Spec',
        page: nn + '.' + mm + ' · ' + chapterName + ' · ' + f.family + '·Spec',
        fam: f
      });
    });
  });
  CAT.blockFor = function (page) { const p = String(page || ''); return CAT.BLOCKS.filter((b) => b.page === p)[0] || null; };
  CAT.blockByFamily = function (chapter, family) {
    return CAT.BLOCKS.filter((b) => b.chapter === String(chapter) && b.family === String(family))[0] || null;
  };
  CAT.blockPages = function () { return CAT.BLOCKS.map((b) => b.page); };
  /** The canonical page SEQUENCE. Head 00–02 first, then the 03–09 block pages in `CAT.BLOCKS` order, then the
      numbered support pages 10–17, then the AI chapter 18. Extra support pages (e.g. a `Masters·` page) are not part
      of the sequence and may sit anywhere, so a re-paginated file is judged on the pages the contract names. */
  CAT.orderNames = function (names) {
    const all = (names || Array.from((penpot.currentFile && penpot.currentFile.pages) || []).map((p) => String(p.name)));
    const head = all.filter((n) => /^0[0-2] · /.test(n)).sort();
    const support = all.filter((n) => /^1[0-7] · /.test(n)).sort();
    const blocks = CAT.BLOCKS.filter((b) => b.chapter !== '18' && all.indexOf(b.page) >= 0).map((b) => b.page);
    const aiBlocks = CAT.BLOCKS.filter((b) => b.chapter === '18' && all.indexOf(b.page) >= 0).map((b) => b.page);
    return head.concat(blocks, support, aiBlocks);
  };
  /** Order half of the pagination gate: the contract pages must appear in that sequence. Reordering by hand, or
      appending a page with `createPage()` (which always lands last), is invisible to every per-page audit. */
  CAT.orderIssues = function (names) {
    const out = [];
    const all = (names || Array.from((penpot.currentFile && penpot.currentFile.pages) || []).map((p) => String(p.name)));
    const want = CAT.orderNames(all);
    const seen = {};
    want.forEach((n, i) => { seen[n] = i; });
    const live = all.filter((n) => Object.prototype.hasOwnProperty.call(seen, n));
    for (let i = 1; i < live.length; i++) {
      if (seen[live[i]] < seen[live[i - 1]]) {
        out.push({ page: live[i], detail: 'page order drift: "' + live[i] + '" (' + (i + 1) + '/' + live.length +
          ' in the file) precedes "' + live[i - 1] + '" but the contract puts it at position ' + (seen[live[i]] + 1) +
          ' of ' + live.length + ' — reorder the pages list (UI drag; the plugin API has no page-move call)' });
        return out;
      }
    }
    return out;
  };
  /** File-level pagination gate: every canonical family page exists exactly once, every 03–09 chapter shell is
      gone, and the contract pages sit in canonical order. Support pages (no canonical ·Spec, e.g. a `Masters·`
      page) are allowed; a chapter page that still holds ·Spec boards is the pre-pagination shape and is reported. */
  CAT.pageIssues = function () {
    const out = [];
    const pages = Array.from((penpot.currentFile && penpot.currentFile.pages) || []);
    const byName = {};
    pages.forEach((p) => { byName[String(p.name)] = p; });
    CAT.BLOCKS.forEach((b) => {
      if (!byName[b.page]) out.push({ page: b.page, detail: 'missing standard block page "' + b.page + '" — 03–09/18 are one page per family (CAT.BLOCKS, ' + CAT.BLOCKS.length + ' pages)' });
    });
    pages.forEach((p) => {
      const nm = String(p.name);
      if (!/^(?:0[3-9]|18)(?:\.| ·)/.test(nm)) return;
      const pr = Array.from((p.root && p.root.children) || []).find((c) => /-PageRoot$/.test(String(c.name)));
      if (!pr) { out.push({ page: nm, detail: nm + ' has no PageRoot — page anatomy is broken' }); return; }
      const specs = Array.from(pr.children || []).filter((c) => c.type === 'board' && /·Spec(?:·|$)/.test(String(c.name)));
      const b = CAT.blockFor(nm);
      if (/^(?:0[3-9]|18) · /.test(nm)) {
        out.push({ page: nm, detail: 'chapter page "' + nm + '" still exists with ' + specs.length + ' ·Spec board(s); the standard is one block page per family — migrate to ' + CAT.BLOCKS.filter((x) => x.chapter === nm.slice(0, 2)).length + ' `NN.MM · Chapter · Family·Spec` pages' });
      } else if (!b && specs.length) {
        out.push({ page: nm, detail: nm + ' holds ' + specs.length + ' ·Spec board(s) but is not a canonical block page — support pages must not carry family specs' });
      }
    });
    return out.concat(CAT.orderIssues(pages.map((p) => String(p.name))));
  };
  CAT.q = CAT.q || {}; CAT.shelf = CAT.shelf || {}; CAT.report = CAT.report || {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const prefix = (p) => String(p || '').slice(0, 2);
  function pageRoot(page) {
    const pg = penpotUtils.getPageByName(page);
    if (!pg) return null;
    return Array.from((pg.root && pg.root.children) || []).find((c) => /-PageRoot$/.test(String(c.name))) || null;
  }
  CAT.pageFams = function (p) {
    const b = CAT.blockFor(p);
    if (b) return [b.family];
    const k = prefix(p);
    return (CAT.PLAN[k] || []).map((f) => f.family);
  };
  CAT.planFor = function (p) { const b = CAT.blockFor(p); if (b) return [b.fam]; return CAT.PLAN[prefix(p)] || []; };

  /** Re-shelve every canonical ·Spec board from its CURRENT measured size, in canonical family order.
      This is the repair for the stale-shelf class: an auto-height spec can grow AFTER the shelf step was written
      (TK.bindBoard rewrites fonts/leading; text grows; the hug height follows), so later boards end up overlapping.
      Idempotent: a correctly packed page moves nothing. The shelf geometry (80 / 208 / 32) is the page contract. */
  CAT.reflowPage = function (o) {
    o = o || {};
    const page = o.page || (penpot.currentPage && penpot.currentPage.name);
    const pr = pageRoot(page); if (!pr) return { err: 'no PageRoot on ' + page };
    const plan = CAT.planFor(page); if (!plan.length) return { err: 'not a standard page: ' + page };
    // every step lands on the 4px grid: a caller's odd start y (a build placed at `prevY + prevH + gap` with an odd
    // measured height) used to leave the next board at y=1965 and gate `off_grid` indicted a sheet nobody had moved.
    const gap = Math.ceil((o.gap === undefined ? 32 : o.gap) / 4) * 4, maxW = o.maxW || 1760;
    const startX = Math.ceil((o.x === undefined ? 80 : o.x) / 4) * 4, startY = Math.ceil((o.y === undefined ? 208 : o.y) / 4) * 4;
    const order = {}; plan.forEach((f, i) => { order[String(f.family).toLowerCase()] = i; });
    const specs = Array.from(pr.children || []).filter((b) => b.type === 'board' && /·Spec(?:·|$)/.test(String(b.name)) && order[String(b.name).split('·')[0].toLowerCase()] !== undefined);
    specs.sort((a, b) => order[String(a.name).split('·')[0].toLowerCase()] - order[String(b.name).split('·')[0].toLowerCase()]);
    let x = startX, y = startY, rowH = 0, moved = 0; const rows = [];
    specs.forEach((b) => {
      const w = Math.round(b.width), h = Math.round(b.height);
      if (x + w > startX + maxW && x > startX) { x = startX; y += rowH + gap; rowH = 0; }
      const nx = pr.x + x, ny = pr.y + y;
      const dx = nx - b.x, dy = ny - b.y;
      // Penpot layout children store x/y RELATIVE to their parent ("absolute" only opts out of flow), so moving the
      // spec board moves its whole subtree. Moving descendants too double-shifts them (measured 2026-10-26: a +500
      // shelf move put every host at +1000). The board is the only write this repair needs.
      if (dx || dy) { try { b.x = nx; b.y = ny; moved++; } catch (e) {} }
      rows.push({ family: String(b.name).split('·')[0], x: x, y: y, w: w, h: h });
      x = Math.ceil((x + w + gap) / 4) * 4;
      rowH = Math.max(rowH, Math.ceil(h / 4) * 4);
    });
    let fit = null;
    if (storage.FN && storage.FN.fitRoot) { try { fit = storage.FN.fitRoot(page); } catch (e) {} }
    return { page: page, boards: specs.length, moved: moved, rows: rows, fit: fit, dry: !!o.dry };
  };
  function cellsFor(cls, axes) {
    return axes.map((a) => a === 'error' ? { state: 'default', status: 'error' } : (a === 'readonly' ? { state: 'readonly' } : { state: a }));
  }
  /** Fixed token capacity. Names/values are brand-configurable; the capacity is the layout contract. */
  CAT.tokenDrift = function (decl) {
    decl = decl || {};
    const out = [];
    const counts = decl.counts || {};
    ['colors', 'types', 'spaces', 'radii', 'shadows', 'dims'].forEach((k) => {
      const want = CAT.CAPACITY[k], got = counts[k];
      if (got !== want) out.push({ detail: 'token capacity ' + k + '=' + got + ', standard is ' + want + ' — 01/02 would change layout' });
    });
    const cols = (decl.colors || []).map((c) => String(c.name || '').replace(/^color\./, ''));
    const strokes = cols.filter((n) => /border|divider|outline/i.test(n)).length;
    if (strokes !== CAT.CAPACITY.strokes) out.push({ detail: 'border/divider colour roles=' + strokes + ', standard is ' + CAT.CAPACITY.strokes + ' — the Strokes board would change height' });
    const tones = cols.filter((n) => {
      const ink = cols.indexOf(n + '-ink') >= 0 || cols.indexOf(n + 'Ink') >= 0;
      const soft = cols.indexOf(n + '-soft') >= 0 || cols.indexOf(n + '-wash') >= 0 || cols.indexOf(n + 'Soft') >= 0 || cols.indexOf(n + 'Wash') >= 0;
      return ink && soft;
    }).length;
    if (tones !== CAT.CAPACITY.tones) out.push({ detail: 'semantic tone triples=' + tones + ', standard is ' + CAT.CAPACITY.tones + ' — the Semantic roles board would change height' });
    return out;
  };
  /** Canonical family set + order on one standard-system page. Shapes are returned so audit_design can report them. */
  CAT.auditFor = function (o) {
    o = o || {};
    const p = prefix(o.page);
    const out = [];
    if (p === '01' && storage.TK && storage.TK.declared) {
      CAT.tokenDrift(storage.TK.declared(true)).forEach((d) => out.push({ shape: null, detail: d.detail }));
    }
    if (!o.root || !/^(?:0[3-9]|18)(?:\.| ·)/.test(String(o.page))) return out;
    const allSpecs = Array.from(o.root.children || []).filter((c) => c.type === 'board' && /·Spec(?:·|$)/.test(String(c.name)));
    const block = CAT.blockFor(o.page);
    if (block) {
      const mine = allSpecs.filter((c) => String(c.name).split('·')[0] === block.family);
      const extras = allSpecs.filter((c) => String(c.name).split('·')[0] !== block.family);
      if (!mine.length) out.push({ shape: null, detail: 'block page "' + block.page + '" must hold exactly one ' + block.spec + ' board — none found' });
      if (mine.length > 1) out.push({ shape: mine[1], detail: 'block page "' + block.page + '" holds ' + mine.length + ' copies of ' + block.spec + ' — exactly one board per page' });
      mine.concat(extras).forEach((b) => {
        if (String(b.name) !== block.spec) out.push({ shape: b, detail: 'block page "' + block.page + '" holds "' + String(b.name) + '"; the page suffix and the board must both be "' + block.spec + '" (the page is addressable by the thing it contains)' });
      });
      return out;
    }
    if (/^(?:0[3-9]|18) · /.test(String(o.page))) {
      out.push({ shape: allSpecs[0] || null, detail: 'chapter page "' + o.page + '" still carries ' + allSpecs.length + ' ·Spec board(s); the standard is one block page per family — migrate to `NN.MM · Chapter · Family·Spec` pages (CAT.BLOCKS)' });
      return out;
    }
    // A support page (e.g. `07.11 … · Masters·Chip`) may carry no family spec; it may not smuggle one in.
    if (allSpecs.length) out.push({ shape: allSpecs[0], detail: '"' + o.page + '" is not a canonical block page but carries ' + allSpecs.length + ' ·Spec board(s) — family specs live only on their CAT.BLOCKS page' });
    return out;
  };
  CAT.planIssues = function () {
    const seen = {}, out = [];
    Object.keys(CAT.PLAN).sort((a, b) => Number(a) - Number(b)).forEach((p) => {
      const local = {};
      CAT.PLAN[p].forEach((f) => {
        if (local[f.family]) out.push({ page: p, detail: 'duplicate family ' + f.family + ' appears twice on ' + p + ' — one ·Spec master per family' });
        local[f.family] = 1;
        if (seen[f.family]) out.push({ page: p, detail: 'family ' + f.family + ' is on both ' + seen[f.family] + ' and ' + p + ' — one family belongs to exactly one standard page' });
        else seen[f.family] = p;
      });
    });
    return out;
  };
  CAT.audit = function () {
    const plan = CAT.planIssues();
    const tokens = (storage.TK && storage.TK.declared ? CAT.tokenDrift(storage.TK.declared(true)) : [{ detail: 'TK not seeded' }]).concat(plan);
    const pages = CAT.BLOCKS.map((b) => {
      const pr = pageRoot(b.page);
      return { page: b.page, findings: pr ? CAT.auditFor({ page: b.page, root: pr }) : [{ detail: 'missing standard block page or its PageRoot: ' + b.page }] };
    });
    const fileFindings = CAT.pageIssues();
    const all = tokens.concat(...pages.map((x) => x.findings), fileFindings);
    return { verdict: all.length ? 'NEEDS_REPAIR' : 'CLEAN', plan: plan, tokens: tokens, pages: pages, file: fileFindings, findings: all };
  };
  CAT.seed = function (root) {
    CAT.active = true;
    const payload = JSON.stringify({ version: CAT.VERSION, capacity: CAT.CAPACITY, inventory: CAT.INVENTORY });
    let n = 0;
    const roots = root ? [root] : [];
    // `currentFile.pages` is a collection proxy: its own forEach iterates lazily (measured 2026-10-24 — one root),
    // while Array.from materializes all 18. Convert first, never call the collection's forEach directly.
    try { Array.from((penpot.currentFile && penpot.currentFile.pages) || []).forEach((p) => { const pr = Array.from((p.root && p.root.children) || []).find((c) => /-PageRoot$/.test(String(c.name))); if (pr) roots.push(pr); }); } catch (e) {}
    // Only the OPEN page's shapes accept a write in this plugin build (measured 2026-10-24: 18 roots iterated, one
    // stamped). So `seed()` is the per-page stamp; `buildPage` stamps the page it builds, which is what makes the
    // 03–09 contract durable without opening every page up front.
    roots.forEach((pr) => { try { pr.setPluginData('nl:cat', payload); n++; } catch (e) {} });
    return { seeded: 'CATALOG', version: CAT.VERSION, capacity: CAT.CAPACITY, stamped: n, note: 'stamps the open page; buildPage stamps each standard page it builds' };
  };
  CAT.hydrate = function () {
    try { const pr = penpotUtils.findShape && penpotUtils.findShape((s) => /-PageRoot$/.test(String(s.name))); const raw = pr && pr.getPluginData ? pr.getPluginData('nl:cat') : null; if (raw) { CAT.active = true; return JSON.parse(raw); } } catch (e) {}
    return null;
  };
  /** Build one standard page, one canonical family at a time. */
  CAT.buildPage = async function (o) {
    o = o || {};
    const page = o.page; const p = prefix(page); const plan = CAT.planFor(page);
    if (/^(?:0[3-9]|18) · /.test(String(page))) {
      const first = CAT.BLOCKS.filter((b) => b.chapter === String(page).slice(0, 2))[0];
      return { err: '03–09/18 are one page per family in the standard: build "' + (first ? first.page : 'NN.MM · Chapter · Family·Spec') + '" (CAT.BLOCKS / scaffold rows), not the chapter page "' + page + '"' };
    }
    if (!plan.length) return { err: 'no standard catalogue for page ' + page };
    const pr = pageRoot(page); if (!pr) return { err: 'no PageRoot on ' + page };
    try { pr.setPluginData('nl:cat', JSON.stringify({ version: CAT.VERSION, capacity: CAT.CAPACITY })); } catch (e) {}
    if (penpot.currentPage.name !== page) { const pg = penpotUtils.getPageByName(page); penpot.openPage(pg.id); await sleep(600); if (penpot.currentPage.name !== page) return { wait: penpot.currentPage.name }; }
    // IDEMPOTENT BY INVENTORY. The queue is session memory and resets on a storage wipe; the boards do not.
    // Continue with the first family the page does not own yet instead of re-drawing from index 0.
    const have = {};
    Array.from(pr.children || []).forEach((b) => {
      if (b.type !== 'board' || !/·Spec(?:·|$)/.test(String(b.name))) return;
      const f = String(b.name).split('·')[0].toLowerCase();
      if (!have[f]) have[f] = b;
    });
    let i = plan.findIndex((f) => !have[String(f.family).toLowerCase()]);
    if (i < 0) { const rf = CAT.reflowPage({ page }); return { page: page, done: true, total: plan.length, existing: true, reflow: rf }; }
    // PAIRED BUILD — the codesign-ui catalog is the manifest, not the generic factory list. LM owns the 1:1 mapping
    // (one representative per component; custom → anatomy board). A page that already owns its spec returned above.
    const LM = storage.LM;
    if (!(LM && (LM.active || (LM.hydrate && LM.hydrate())))) {
      return { page: page, family: plan[i].family, err: 'this catalog is paired 1:1 with codesign-ui — load library_engine.js + LM.load(assets/libraries/codesign-ui.json) or LM.hydrate() before CAT.buildPage' };
    }
    const fam0 = plan[i];
    const r = await LM.buildPage({ page: page, parent: pr, x: 80, y: 208, finish: o.finish, register: o.register });
    if (r.err) return { page: page, family: fam0.family, err: r.err };
    if (!r.built || !r.built.length) return { page: page, family: fam0.family, err: 'paired builder returned no component', gaps: r.gaps || [] };
    const rf = CAT.reflowPage({ page });
    CAT.q[page] = i + 1;
    return { page: page, family: fam0.family, built: r.built, gaps: r.gaps || [], reflow: { moved: rf.moved, boards: rf.boards } };
  };
  return { seeded: 'CATALOG', version: CAT.VERSION, capacity: CAT.CAPACITY, inventory: CAT.INVENTORY, pages: Object.keys(CAT.PLAN).sort((a, b) => Number(a) - Number(b)), families: CAT.INVENTORY ? CAT.INVENTORY.visual : Object.keys(CAT.PLAN).reduce((n, k) => n + CAT.PLAN[k].length, 0) };
})(storage, penpot, penpotUtils);