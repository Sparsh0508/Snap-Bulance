import * as React from "react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { socket } from "../../../utils/socket"; // Import your socket
import "./LookingForDriver.css";
import { api } from "../../../utils/api";
const LookingForDriver = () => {
    const navigate = useNavigate();
    const { tripId } = useParams();
    useEffect(() => {
        if (!tripId)
            return;
        const joinTripRoom = () => {
            socket.emit("joinTrip", tripId);
        };
        const handleTripAccepted = (data) => {
            console.log("Driver accepted!", data);
            // Navigate to the tracking page now that we have a driver
            navigate(`/user/track/${tripId}`);
        };
        const handleTripStatusChanged = (data) => {
            if (["ASSIGNED", "EN_ROUTE", "ARRIVED", "ON_BOARD"].includes(data.status)) {
                navigate(`/user/track/${tripId}`);
            }
        };
        const handleCfrAlert = (data) => {
            alert(`🚨 CFR ALERT 🚨\n\n${data.message}`);
        };
        const syncTripStatus = async () => {
            try {
                const response = await api.get(`/users/trip/${tripId}`);
                if (response.data?.driverId || (response.data?.status && response.data.status !== "SEARCHING")) {
                    navigate(`/user/track/${tripId}`);
                }
            }
            catch (error) {
                console.error("Failed to sync trip status:", error);
            }
        };
        // Connect and join the trip room to wait for updates
        socket.connect();
        if (socket.connected) {
            joinTripRoom();
        }
        socket.on("connect", joinTripRoom);
        socket.on("tripAccepted", handleTripAccepted);
        socket.on("tripStatusChanged", handleTripStatusChanged);
        socket.on("cfrAlert", handleCfrAlert);
        syncTripStatus();
        const interval = setInterval(syncTripStatus, 3000);
        return () => {
            clearInterval(interval);
            socket.off("connect", joinTripRoom);
            socket.off("tripAccepted", handleTripAccepted);
            socket.off("tripStatusChanged", handleTripStatusChanged);
            socket.off("cfrAlert", handleCfrAlert);
            // Don't disconnect here, we need it for the next page
        };
    }, [navigate, tripId]);
    const handleCancel = async () => {
        try {
            await api.post(`/trips/${tripId}/cancel`);
            // Emit a socket event if you want the backend to know instantly,
            // or just navigate back home
            navigate("/user/home", { replace: true });
        }
        catch (error) {
            console.error("Failed to cancel trip:", error);
            alert("Could not cancel the trip. Please try again.");
        }
    };
    return (<div className="sb-searching">
      <div className="sb-searching__content">
        {/* ── Header ── */}
        <header className="sb-searching__header">
          <span className="sb-searching__eyebrow">
            <span className="sb-searching__eyebrow-dot" aria-hidden="true"/>
            Live Dispatch
          </span>
          <h1 className="sb-searching__title">
            Locating
            <br />
            Nearest Unit
          </h1>
          <span className="sb-searching__trip-id" title="Trip ID">
            # {tripId}
          </span>
        </header>

        {/* ── Sonar Pulse Rig ── */}
        <div className="sb-sonar" role="status" aria-label="Searching for ambulance">
          <div className="sb-sonar__ring sb-sonar__ring--1" aria-hidden="true"/>
          <div className="sb-sonar__ring sb-sonar__ring--2" aria-hidden="true"/>
          <div className="sb-sonar__ring sb-sonar__ring--3" aria-hidden="true"/>
          <div className="sb-sonar__core" aria-hidden="true">
            🚑
          </div>
        </div>

        {/* ── Status Ticker ── */}
        <div className="sb-searching__status" aria-live="polite">
          <div className="sb-searching__steps" aria-label="Dispatch steps">
            <span className="sb-searching__step sb-searching__step--done" title="Trip created"/>
            <span className="sb-searching__step sb-searching__step--done" title="Location confirmed"/>
            <span className="sb-searching__step sb-searching__step--active" title="Finding driver"/>
            <span className="sb-searching__step" title="Driver assigned"/>
            <span className="sb-searching__step" title="En route"/>
          </div>
          <span className="sb-searching__status-label">
            Scanning for available units
            <span className="sb-searching__ellipsis" aria-hidden="true"/>
          </span>
        </div>

        {/* ── Cancel Panel ── */}
        <div className="sb-searching__dev-panel">
          <span className="sb-searching__dev-hint">Entered by mistake?</span>
          <button onClick={handleCancel} className="sb-dev-btn" style={{
            background: "transparent",
            color: "#e63946",
            border: "1px solid #e63946",
        }}>
            Cancel Request
          </button>
        </div>
      </div>
    </div>);
};
export default LookingForDriver;
