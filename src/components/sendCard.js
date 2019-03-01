import React, { Component } from "react";
import Button from "@material-ui/core/Button";
import SendIcon from "@material-ui/icons/Send";
import TextField from "@material-ui/core/TextField";
import QRIcon from "mdi-material-ui/QrcodeScan";
import LinkIcon from "@material-ui/icons/Link";
import InputAdornment from "@material-ui/core/InputAdornment";
import Tooltip from "@material-ui/core/Tooltip";
import Modal from "@material-ui/core/Modal";
import QRScan from "./qrScan";
import { withStyles, Grid, Typography } from "@material-ui/core";
import { getDollarSubstring } from "../utils/getDollarSubstring";
import { emptyAddress } from "connext/dist/Utils";
import { convertPayment } from "connext/dist/types";
import BN from "bn.js";

const queryString = require("query-string");

const styles = theme => ({
  icon: {
    width: "40px",
    height: "40px"
  },
  input: {
    width: "100%"
  },
  button: {
    backgroundColor: "#FCA311",
    color: "#FFF"
  }
});

class PayCard extends Component {
  constructor(props) {
    super(props);

    this.state = {
      paymentVal: {
        meta: {
          purchaseId: "payment"
          // memo: "",
        },
        payments: [
          {
            recipient: this.props.scanArgs.recipient ? this.props.scanArgs.recipient : "",
            amount: {
              amountToken: this.props.scanArgs.amount ? (this.props.scanArgs.amount * Math.pow(10, 18)).toString() : "0",
              amountWei: "0"
            },
            type: "PT_CHANNEL"
          }
        ]
      },
      addressError: null,
      balanceError: null,
      sendError: false,
      scan: false,
      displayVal: this.props.scanArgs.amount ? this.props.scanArgs.amount : "0",
      showReceipt: false
      };
  }

  async componentDidMount() {
    const { location } = this.props;
    const query = queryString.parse(location.search);
    if (query.amountToken) {
      await this.setState(oldState => {
        oldState.paymentVal.payments[0].amount.amountToken = (query.amounttoken * Math.pow(10, 18)).toString();
        oldState.displayVal = query.amounToken;
        return oldState;
      });
    }
    if (query.recipient) {
      await this.setState(oldState => {
        oldState.paymentVal.payments[0].recipient = query.recipient;
        return oldState;
      });
    }
  }

  async updatePaymentHandler(value) {
    await this.setState(oldState => {
      oldState.paymentVal.payments[0].amount.amountToken = (value * Math.pow(10, 18)).toString();
      return oldState;
    });
    this.setState({ displayVal: value });
    console.log(`Updated paymentVal: ${JSON.stringify(this.state.paymentVal, null, 2)}`);
  }

  handleQRData = async scanResult => {
    const { publicUrl } = this.props;

    let data = scanResult.split("/send?");
    if (data[0] === publicUrl) {
      let temp = data[1].split("&");
      let amount = temp[0].split("=")[1];
      let recipient = temp[1].split("=")[1];
      this.updatePaymentHandler(amount);
      this.updateRecipientHandler(recipient);
    } else {
      this.updateRecipientHandler(scanResult);
      console.log("incorrect site");
    }
    this.setState({
      scan: false
    });
  };

  async updateRecipientHandler(value) {
    await this.setState(oldState => {
      oldState.paymentVal.payments[0].recipient = value;
      return oldState;
    });
    console.log(`Updated recipient: ${JSON.stringify(this.state.paymentVal.payments[0].recipient, null, 2)}`);
  }

  async linkHandler() {
    const { connext } = this.props;
    const { paymentVal } = this.state;

    // generate secret, set type, and set
    // recipient to empty address
    const payment = {
      ...paymentVal.payments[0],
      type: "PT_LINK",
      recipient: emptyAddress,
      secret: connext.generateSecret()
    };

    const updatedPaymentVal = {
      ...paymentVal,
      payments: [payment]
    };

    console.log(`Updated paymentVal: ${JSON.stringify(updatedPaymentVal, null, 2)}`);

    this.setState({
      paymentVal: updatedPaymentVal
    });

    // refactored to avoid race conditions around
    // setting state
    await this._paymentHandler(updatedPaymentVal);
  }

  async paymentHandler() {
    await this._paymentHandler(this.state.paymentVal);
  }

  async _paymentHandler(paymentVal) {
    const { connext, web3, channelState } = this.props;

    console.log(`Submitting payment: ${JSON.stringify(paymentVal, null, 2)}`);
    this.setState({ addressError: null, balanceError: null });
    let balanceError, addressError;

    // validate that the token amount is within bounds
    const payment = convertPayment("bn", paymentVal.payments[0].amount);
    if (payment.amountToken.gt(new BN(channelState.balanceTokenUser))) {
      balanceError = "Insufficient balance in channel";
    }

    if (payment.amountToken.isZero()) {
      balanceError = "Please enter a payment amount above 0";
    }

    // validate recipient is valid address OR the empty address
    const recipient = paymentVal.payments[0].recipient;
    if (!web3.utils.isAddress(recipient) && recipient !== emptyAddress) {
      addressError = "Please choose a valid address";
    }

    // return if either errors exist
    if (balanceError || addressError) {
      this.setState({ balanceError, addressError });
      return;
    }

    // otherwise make payment
    try {
      let paymentRes = await connext.buy(paymentVal);
      console.log(`Payment result: ${JSON.stringify(paymentRes, null, 2)}`);
      if (paymentVal.payments[0].type === "PT_LINK") {
        const secret = paymentVal.payments[0].secret;
        const amount = paymentVal.payments[0].amount;
        this.props.history.push({
          pathname: "/redeem",
          search: `?secret=${secret}&amountToken=${amount.amountToken}&amountWei=${amount.amountWei}`,
          state: { isConfirm: true, secret, amount }
        });
      }
      this.setState({ showReceipt: true });
    } catch (e) {
      console.log("SEND ERROR, SETTING");
      this.setState({ sendError: true, showReceipt: true });
    }
  }

  render() {
    const { classes, channelState } = this.props;
    const { sendError, scan } = this.state;
    console.log("scan: ", scan);
    return (
      <Grid
        container
        spacing={24}
        direction="column"
        style={{
          display: "flex",
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: "10%",
          paddingBottom: "10%",
          textAlign: "center",
          justify: "center"
        }}
      >
        <Grid container wrap="nowrap" direction="row" justify="center" alignItems="center">
          <Grid item xs={12}>
            <SendIcon className={classes.icon} />
          </Grid>
        </Grid>
        <Grid item xs={12}>
          <Grid container direction="row" justify="center" alignItems="center">
            <Typography variant="h2">
              <span>
                {channelState
                  ? "$" +
                    getDollarSubstring(channelState.balanceTokenUser)[0] +
                    "." +
                    getDollarSubstring(channelState.balanceTokenUser)[1].substr(0, 2)
                  : "$0.00"}
              </span>
            </Typography>
          </Grid>
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            id="outlined-number"
            label="Amount"
            value={this.state.displayVal}
            type="number"
            margin="normal"
            variant="outlined"
            onChange={evt => this.updatePaymentHandler(evt.target.value)}
            error={this.state.balanceError != null}
            helperText={this.state.balanceError}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            style={{ width: "100%" }}
            id="outlined"
            label="Recipient Address (not required for link payment)"
            type="string"
            required
            value={this.state.paymentVal.payments[0].recipient === emptyAddress ? "" : this.state.paymentVal.payments[0].recipient}
            onChange={evt => this.updateRecipientHandler(evt.target.value)}
            margin="normal"
            variant="outlined"
            helperText={this.state.addressError}
            error={this.state.addressError != null}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip disableFocusListener disableTouchListener title="Scan with QR code">
                    <Button variant="contained" color="primary" style={{ color: "#FFF" }} onClick={() => this.setState({ scan: true })}>
                      <QRIcon />
                    </Button>
                  </Tooltip>
                </InputAdornment>
              )
            }}
          />
        </Grid>
        <Modal
          id="qrscan"
          open={this.state.scan}
          onClose={() => this.setState({ scan: false })}
          style={{
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            position: "absolute",
            top: "10%",
            width: "375px",
            marginLeft: "auto",
            marginRight: "auto",
            left: "0",
            right: "0"
          }}
        >
          <QRScan handleResult={this.handleQRData} history={this.props.history} />
        </Modal>
        <Grid item xs={12}>
          <Grid container direction="row" alignItems="center" justify="center" spacing={16}>
            <Grid item xs={6}>
              <Button fullWidth className={classes.button} variant="contained" size="large" onClick={() => this.linkHandler()}>
                Link
                <LinkIcon style={{ marginLeft: "5px" }} />
              </Button>
            </Grid>
            <Grid item xs={6}>
              <Button fullWidth className={classes.button} variant="contained" size="large" onClick={() => this.paymentHandler()}>
                Send
                <SendIcon style={{ marginLeft: "5px" }} />
              </Button>
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={12}>
          <Button
            variant="outlined"
            style={{
              background: "#FFF",
              border: "1px solid #F22424",
              color: "#F22424",
              width: "15%"
            }}
            size="medium"
            onClick={() => this.props.history.push("/")}
          >
            Back
          </Button>
        </Grid>
        <Modal
          open={this.state.showReceipt}
          onBackdropClick={() => this.setState({ showReceipt: false, sendError: false })}
          style={{
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            position: "absolute",
            top: "25%",
            width: "375px",
            marginLeft: "auto",
            marginRight: "auto",
            left: "0",
            right: "0"
          }}
        >
          <Grid container style={{ backgroundColor: "#FFF", paddingTop: "10%", paddingBottom: "10%" }} justify="center">
            {sendError ? (
              <Grid style={{ width: "80%" }}>
                <Grid item style={{ margin: "1em" }}>
                  <Typography variant="h5" style={{ color: "#F22424" }}>
                    Payment Failed
                  </Typography>
                </Grid>
                <Grid item style={{ margin: "1em" }}>
                  <Typography variant="body1" style={{ color: "#0F1012" }}>
                    This is most likely because the recipient's Card is being set up.
                  </Typography>
                </Grid>
                <Grid item style={{ margin: "1em" }}>
                  <Typography variant="body1" style={{ color: "#0F1012" }}>
                    Please try again in 30s and contact support if you continue to experience issues. (Settings --> Support)
                  </Typography>
                </Grid>
              </Grid>
            ) : (
              <Grid style={{ width: "80%" }}>
                <Grid item style={{ margin: "1em" }}>
                  <Typography variant="h5" style={{ color: "#009247" }}>
                    Payment Success!
                  </Typography>
                </Grid>
                <Grid item style={{ margin: "1em" }}>
                  <Typography variant="body1" style={{ color: "#0F1012" }}>
                    Amount: ${this.state.paymentVal.payments[0].amount.amountToken * Math.pow(10, -18)}
                  </Typography>
                </Grid>
                <Grid item style={{ margin: "1em" }}>
                  <Typography variant="body2" style={{ color: "#0F1012" }} noWrap>
                    To: {this.state.paymentVal.payments[0].recipient}
                  </Typography>
                </Grid>
              </Grid>
            )}
            <Grid item style={{ margin: "1em", flexDirection: "row", width: "80%" }}>
              <Button color="primary" variant="outlined" size="small" onClick={() => this.setState({ showReceipt: false, sendError: false })}>
                Pay Again
              </Button>
              <Button
                style={{
                  background: "#FFF",
                  border: "1px solid #F22424",
                  color: "#F22424",
                  marginLeft: "5%"
                }}
                variant="outlined"
                size="small"
                onClick={() => this.props.history.push("/")}
              >
                Home
              </Button>
            </Grid>
          </Grid>
        </Modal>
      </Grid>
    );
  }
}

export default withStyles(styles)(PayCard);
