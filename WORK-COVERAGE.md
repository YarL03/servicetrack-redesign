# Покрытие рабочих сценариев

Аудит исходников выполнен 03.11.2026. `shared/work-screens.js` регистрирует 71 экран и диалог, одинаковые по содержимому для v1, v2 и v3. Каждый ID открывается как `v1/index.html#ID` (аналогично v2 и v3), включая состояния диалогов. Диалоги также открываются поверх соответствующей страницы кнопками.

Макеты используют вымышленные данные. Значения, имена, адреса, ИНН и контракты не являются выгрузкой пользователей проекта. Схема карты и изображение прибора нарисованы локальными SVG. Внешние API, карты, аналитика и CDN не подключаются. Фото и видеозаписи пользователей не включены.

## Заявки

| Текущий источник | ID макета | Покрытие |
| --- | --- | --- |
| `front/src/pages/service-requests/index.tsx`; `components/ServiceRequests/ServiceRequestsTable/{index,TableToolbar}.tsx` | `requests`, `requests-archive` | Реестр, статусы, адреса, исполнители, плановые даты; поиск по номеру/лицевому счёту/новому прибору; архив; размер страницы; переход в карточку |
| `front/src/components/Filters/ui/{Filters,FiltersSetItem,SaveSetModal}.tsx` | `request-filter`, `request-filter-save`, `request-filter-edit`, `request-filter-delete` | Новый фильтр, применённые условия, сохранение/обновление/применение/удаление набора, сброс |
| `front/src/components/ServiceRequests/new/{index,AddressField}.tsx` | `request-create` | Контракт, компания, вид работ, лицевой счёт, абонент, телефон, адрес, квартира, даты, комментарий, обязательность |
| `front/src/components/ServiceRequests/assign-service-requests/` | `request-assign`, `request-assign-confirm` | Выбор нескольких заявок и исполнителей, поиск исполнителя, подтверждение |
| `front/src/components/ServiceRequests/service-request/index.tsx` | `request`, `request-object`, `request-denials` | Три действующие вкладки карточки заявки; статус, номер, контракт и контекст |
| `front/src/components/ServiceRequests/service-request/General/index.tsx` | `request` | Абонент, телефон, счёт, адрес, координаты, участок, исполнители, менеджер, даты, комментарий |
| `.../General/EditCustomerFormModal.tsx` | `request-edit-customer` | Абонент и телефон |
| `.../General/EditAddressFormModal/index.tsx` | `request-edit-address` | Адрес, квартира, корпус, координаты, комментарий |
| `.../General/EditWorkersFormModal/EditWorkersFormModal.tsx` | `request-edit-workers` | Выбор нескольких исполнителей |
| `.../General/EditStartDateFormModal.tsx` | `request-edit-start` | Дата и время ввода |
| `.../General/EditPlannedDateFormModal.tsx` | `request-edit-planned` | Дата и время окончания |
| `front/src/components/ServiceRequests/manager/ui/` | `request-edit-manager` | Список менеджеров, выбор и подтверждение назначения |
| `.../General/StatusHistory/` | `request-history` | Статусы, пользователь, время, комментарии |
| `.../DeviceInformation/{index,Unmounted,SecondImported}.tsx` | `request-object`, `request-object-edit` | Демонтированный объект и импортированные показания установленного объекта |
| `front/src/shared/types/workContent.types.ts`; `.../WorkData/{WorkData,WorkDataItem,WorkDataItemContent,WorkDataReadWriteForm}.tsx` | `request-object`, `request-object-edit` | Динамические этапы, исходные/рабочие значения, документы; текст, число, дата, штрихкод; просмотр и редактирование |
| `.../WorkData/{WorkDataMedia,WorkDataAudio,WorkDataFiles,WorkDataMultiple,WorkDataDocumentsForm}.tsx` | `request-object`, `request-object-edit`, `request-files`, `request-file`, `request-video` | Фото, видео, аудио, документы и смешанное поле; метаданные, отсутствие необязательного файла, список вложений |
| `.../WorkData/{WorkDataMedia,WorkDataAudio,WorkDataFiles}.tsx` | `request-file-edit`, `request-file-delete` | Выбор нового файла для замены, предупреждение о замене, подтверждение удаления |
| `.../WorkData/WorkDataInformationEdit.tsx` | `request-file-comment` | Редактирование комментария вложения |
| `.../ServiceRequestFooter.tsx` | `request-status`, `request-finish`, `request-revision`, `request-save`, `request-files` | Каталог переходов, завершение, возврат на доработку/в работу, подтверждение сохранения, скачивание фотографий |
| `.../ServiceRequestRejectModal.tsx` | `request-cancel` | Отмена с причиной из справочника |
| `.../ServiceRequestSetStatus.tsx` | `request-reopen` | Переход из «Завершена» в «Выполнена» с обязательной причиной |
| `.../Delayed/{Delayed,TableToolbar,AddDelay,EditDelay}.tsx`; `.../Delayed/TableBody/` | `request-denials`, `denial-create`, `denial-edit` | Реестр недопусков; дата; обязательное фото уведомления; фото акта; комментарий; просмотр и редактирование |

Здесь `...` в строках таблицы означает `front/src/components/ServiceRequests/service-request`.

Тип `MULTIPLE` в исходниках означает смешанные вложения: фото, видео, аудио и документы в одном поле. Это отражено в последнем этапе формы, а не заменено чекбоксами выбора ответа.

## Дашборд

| Текущий источник | ID макета | Покрытие |
| --- | --- | --- |
| `front/src/components/Dashboard/dashboard/AdminDashboard/ui/{Dashboard,DashboardPanel,DashboardControlButtons}/` | `dashboard`, `dashboard-status` | Виды работ, переключение движения и статусов, архив |
| `.../ui/{PrimaryCharts,SecondaryCharts,PeriodPicker}/`; `.../constants/{period,status}.ts` | `dashboard`, `dashboard-period` | Движение заявок, распределение статусов, время выполнения, стандартные и произвольный периоды |
| `.../ui/{MapValue,RequestMap,MapLegend,ContractsList}/` | `dashboard-map`, `dashboard-contracts` | Карта, карточка заявки, связанные контракты и переходы |
| `.../ui/{RequestsStatusesDashboardCard,DashboardServiceRequestsFilters,DashboardServiceRequestStatusFilters,ServiceRequestsDashboardTable,ServiceRequestByDateStatusLegend}/` | `dashboard-status`, `request-filter`, `request-filter-save`, `request-filter-edit` | Группировка по контрактам, периоды, поиск, фильтры, сохраняемые наборы, сроки и легенда |

Здесь `...` означает `front/src/components/Dashboard/dashboard/AdminDashboard`.

Цветовая легенда сроков отделена от статусов рабочего процесса: завершена в срок; выполнена, но не завершена; в работе; до срока менее 14 дней; просрочена. Карта — схематичная иллюстрация компоновки, не географический сервис.

## Контракты

| Текущий источник | ID макета | Покрытие |
| --- | --- | --- |
| `front/src/modules/contracts/components/contracts-table/`; `constants/contract-table-search-categories.constants.ts` | `contracts`, `contracts-archive` | Список, номер договора/заказчик, вид работ, даты, статусы и архив |
| `front/src/modules/contracts/components/contracts-table-filters/`; `constants/contract-table-filters.constants.ts` | `contract-filters`, `contract-filter-save`, `contract-filter-edit`, `contract-filter-delete` | Номер, заказчик, статус, порядковый номер, вид работ, даты; CRUD наборов фильтров |
| `front/src/components/AddContract/AddContractForm.tsx` | `contract-create` | Номер, сроки, описание, вид работ, заказчик, исполнитель, менеджеры |
| `front/src/modules/contracts/components/contract-summary/`; `constants/summary-tabs.constants.ts` | `contract`, `contract-documents`, `contract-import`, `contract-requests` | Четыре вкладки контракта |
| `front/src/modules/contracts/components/contract-general-info/{contract-general-info,contract-company-persons}.tsx` | `contract`, `contract-edit` | Общая информация, исполнитель, менеджеры, статус, описание, контакты заказчика |
| `.../contract-general-info-modal.tsx` | `contract-company` | Смена заказчика с ИНН, ОГРН, сайтом и комментарием |
| `.../contract-general-info-archive-manager.tsx`; `front/src/components/ArchiveButton/` | `contract-archive`, `contract-restore` | Архивация и восстановление |
| `front/src/modules/contracts/components/contract-documents/` | `contract-documents`, `contract-document-add`, `contract-document-edit`, `contract-document-delete` | Файл, тип «Заявки / Другое», название, описание, автор/дата, скачивание, изменение и удаление |
| `front/src/modules/contracts/components/contract-data-import/add-imports-modal.tsx` | `contract-import-add` | Excel; заявки; заявки сторонней системы; данные опроса ПУ; приёмка заказчиком; тип устройства и комментарий |
| `front/src/modules/contracts/components/contract-data-import/contract-data-imports*.tsx` | `contract-import`, `contract-import-result` | История, начало/окончание, автор, статус, всего/обновлено/добавлено/пропущено/ошибки, комментарий, скачивание результата |
| `front/src/modules/contracts/components/contract-requests/` | `contract-requests` | Поиск и список заявок, переход в карточку |

Здесь `...` означает `front/src/modules/contracts/components/contract-general-info`.

В исходниках и форме макета для импорта заявок обязателен тип устройства; для «Принято заказчиком» обязателен комментарий. Поле типа устройства скрывается для данных опроса и приёмки. Ограничение комментария — 400 символов. Формат файла — XLS/XLSX.

## Отчёты и уведомления

| Текущий источник | ID макета | Покрытие |
| --- | --- | --- |
| `front/src/pages/reports/index.tsx` | `reports` | Пять действующих типов отчётов |
| `front/src/components/Reports/report/ReportExecuted.tsx`; `report-filter/` | `report-executed`, `report-filter` | Несколько статусов, начало/конец периода, адресные и рабочие фильтры, скачивание и просмотр |
| `.../ReportUniversal.tsx` | `report-universal` | Скачать / просмотреть |
| `.../ReportForma.tsx` | `report-forma` | Форма выработки перечней, скачать |
| `.../ReportDelay.tsx` | `report-delay` | Реестр актов недопуска, скачать |
| `.../ReportMasterCounter.tsx` | `report-counter` | Мастер-счётчики, скачать |
| `.../Report.tsx`; `front/src/pages/reports/[id].tsx` | `report-dynamic` | Динамический отчёт: дата/период/сейчас, сводная таблица и инструменты |
| `.../ReportPreview.tsx`; `front/src/router/router.tsx` | `report-preview` | Общий адаптивный шаблон просмотра XLSX для обоих preview routes; скачать, закрыть |
| `front/src/modules/notifications/components/{notifications,notifications-popover,notifications-header,notification-list,notifications-trigger}.tsx` и каталог `notification-list/` | `notifications` | Список, счётчик новых, одна вкладка «Все», индивидуальные и массовые действия |
| `front/src/modules/notifications/components/notification-details.tsx` | `notification` | Полный текст, дата, возврат и действия |
| `front/src/modules/notifications/components/notification-actions-menu/` | `notification-delete-all`, `notifications` | Отметить новым/прочитанным, удалить, массовая отметка и удаление |

Здесь `...` означает `front/src/components/Reports/report`.

В макете кнопки скачивания отчётов создают локальный CSV с демонстрационными строками. Это явно подписано возле действия. Реальный продукт генерирует Excel; этот серверный процесс не имитируется созданием ложного XLSX. Для фото, контрактных документов и результатов импорта показывается сообщение о демонстрационном запросе, а не фиктивное скачивание.

## Роли, ограничения и состояния

- Реестр макетов содержит действия разных ролей для проверки охвата. Он не реализует авторизацию; доступность в рабочем приложении должна следовать исходным условиям ролей и статусов.
- Завершение заявки: `EXECUTED`, заполнены обязательные данные, редактирование выключено. `request-finish` показывает именно этот контекст.
- Отмена заявки: `MANAGER`, `PROJECT_MANAGER`, `DIRECTOR`, `FUNCTIONAL_ADMIN`, `ADMIN`, с ограничениями по текущему статусу. Заказчику операция скрыта.
- Возврат: `MANAGER`; `CANCELLED`/`REJECTED` → в работу; `EXECUTED`/`DONE` → на доработку. Обе команды устанавливают `READY_TO_PROCESS`; «На доработке» — отдельный признак, не название статуса. Открытие завершённой заявки требует причины.
- Рабочие данные: `ADMIN`/`MANAGER`; для исполнителя — `IN_PROGRESS` и режим загрузки. Права этапа — `availableForEdit`, fallback `MANAGER`/`WORKER`. Сам блок показывается в `IN_PROGRESS`, `EXECUTED`, `DONE`, `APPROVED` или при доработке.
- Изменение исполнителей: `MANAGER`, `PROJECT_MANAGER`, `DIRECTOR`, `ADMIN`, `FUNCTIONAL_ADMIN`, `OWNER`; статусы `CREATED`, `READY_TO_PROCESS`, `IN_PROGRESS`, `DELAYED`.
- Создание недопуска: не заказчик; `READY_TO_PROCESS`/`DELAYED`. Экран недопусков и его контекст показывают пример задержанной заявки.
- ZIP фотографий: `EXECUTED`/`DONE`; каталог вложений показывает контекст выполненной заявки.
- У заказчика скрываются реестр недопусков и отчёт по мастер-счётчикам. В каталоге дизайна они остаются для просмотра всех ролей.
- Уведомления доступны согласно `CUSTOMER_AND_ABOVE_ROLES`. Дополнительные категории уведомлений не придуманы: в исходниках есть только «Все».
- Создание заявок/контрактов и загрузки учитывают тариф. Общие состояния из `system-screens.js`: `state-tariff`, `state-storage`, `state-loading`, `state-error`, `state-offline`, `state-forbidden`, `state-empty`, `state-not-found`, `state-unsaved`, `state-delete`.
- Исполнители-группы и печать АДПУ закомментированы в текущих компонентах; активными действиями макетов они не представлены.
- Сроки, статусы, номера, данные диаграмм и содержимое документов демонстрационные. Видео не включено, аудиокнопка показывает визуальное состояние воспроизведения без записи; это подписано в интерфейсе.

## Адаптация и проверка

Базовые диапазоны: xs `<600`, sm `600–899`, md `900–1199`, lg `1200–1535`, xl `≥1536` CSS px. `shared/work.css` дополняет `base.css`: графики масштабируются; таблицы становятся карточками; расширенные параметры поиска сворачиваются под «Параметры поиска» на xs/sm; боковой контекст переносится под форму; этапы и медиа перестраиваются в одну колонку; все диалоги переходят в полноэкранный режим на xs.

Проверено при создании: `node --check tasks/redesign/shared/work-screens.js`; выполнение `core.js` и `work-screens.js` в Node VM; все 71 `render()` завершились без исключений и строк `undefined`. Полная визуальная и браузерная проверка вариантов описывается в общем отчёте проекта.
