import { RouteMessage, RouteScaffold } from "../../components/RouteScaffold";

export default function CustomerMessagesScreen() {
  return (
    <RouteScaffold eyebrow="Customer" title="Messages" description="Keep conversations about your service requests in one place.">
      <RouteMessage>Your conversations will appear here when a provider replies to a request.</RouteMessage>
    </RouteScaffold>
  );
}
